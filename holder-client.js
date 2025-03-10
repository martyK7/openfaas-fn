const axios = require("axios");

// how to invoke: node holder-client.js [holder_host] [issuer_host] [cred_def_id] [repository] [tag]

const holder_host = process.argv[2];
const issuer_host = process.argv[3];
const cred_def_id = process.argv[4];
const repository = process.argv[5].toLowerCase();
const tag = process.argv[6];
const gh_secret = process.argv[7];

const namespace = repository.split("/")[0];
const project = repository.split("/")[1];

const getDigest = async () => {
    if (gh_secret) {
        console.log("there is a TOKEN")
    } else
        console.log("there is no TOKEN")
    const tokenResponse = await axios.get(
        `https://ghcr.io/token?scope=repository:${repository}:pull`,
        { headers: { Authorization: `Basic martyk7:${gh_secret}`, Accept: "application/json" } } //TODO: does this fly; no try docker auth
    );
    const token = tokenResponse.data.token;
    const response = await axios.get(
        `https://ghcr.io/v2/${repository}/manifests/${tag}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.headers["docker-content-digest"];
};

let config = {
    maxBodyLength: Infinity,
    baseURL: `http://${holder_host}`,
    headers: {},
};

const issuer_did = "6i7GFi2cDx524ZNfxmGWcp";

const getConnectionId = async () => {
    const response = await axios.get("/connections", config);
    return response.data.results.find((it) => it.their_label === "Issuer")
        .connection_id;
};

const getLatestSchemaId = async () => {
    const response = await axios.get(`http://${issuer_host}/schemas/created`);
    const schemas = response.data.schema_ids;
    schemas.sort((a, b) => parseFloat(a.split(":")[3]) - parseFloat(b.split(":")[3]));
    return schemas.pop();
};

const sendProposal = async (proposal) => {
    const data = {
        auto_remove: true,
        comment:
            "Proposal to create new OpenFaas function and upload to container registry",
        connection_id: proposal.connection_id,
        cred_def_id: proposal.cred_def_id,
        credential_proposal: {
            "@type": "issue-credential/1.0/credential-preview",
            attributes: [
                {
                    "mime-type": "application/json",
                    name: "namespace",
                    value: proposal.namespace,
                },
                {
                    "mime-type": "application/json",
                    name: "repository",
                    value: proposal.repository,
                },
                {
                    "mime-type": "application/json",
                    name: "tag",
                    value: proposal.tag,
                },
                {
                    "mime-type": "application/json",
                    name: "digest",
                    value: proposal.digest,
                },
            ],
        },
        issuer_did: proposal.issuer_did,
        schema_id: proposal.issuer_schema_id,
        schema_issuer_did: proposal.issuer_did,
        schema_name: "docker-vc",
        schema_version: proposal.issuer_schema_id.split(":")[3],
        trace: true,
    };
    const response = await axios.post(
        `/issue-credential/send-proposal`,
        data,
        config
    );
    return {
        credential_exchange_id: response.data.credential_exchange_id,
        thread_id: response.data.thread_id,
    };
};

const getProposalRecords = async (
    connection_id,
    credential_exchange_id,
    state
) => {
    const response = await axios.get(
        `/issue-credential/records?connection_id=${connection_id}&role=holder&state=${state}`,
        config
    );
    return response.data.results.find((it) => it.connection_id === connection_id);
};

const waitForProposalRecords = async (
    connection_id,
    credential_exchange_id,
    state
) => {
    let offerReceived = await getProposalRecords(
        connection_id,
        credential_exchange_id,
        state
    );
    while (!offerReceived) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("finding record with state: " + state + "...");
        offerReceived = await getProposalRecords(
            connection_id,
            credential_exchange_id,
            state
        );
    }
    return offerReceived.credential_exchange_id;
};

const waitForOfferReceived = async (connection_id, credential_exchange_id) => {
    return await waitForProposalRecords(
        connection_id,
        credential_exchange_id,
        "offer_received"
    );
};

const confirmOffer = async (credential_exchange_id) => {
    await axios.post(
        `/issue-credential/records/${credential_exchange_id}/send-request`,
        null,
        config
    );
};

const waitForCredentialReceived = async (
    connection_id,
    credential_exchange_id
) => {
    return await waitForProposalRecords(
        connection_id,
        credential_exchange_id,
        "credential_received"
    );
};

const storeCredential = async (credential_exchange_id, tag) => {
    const data = {
        credential_id: `${namespace}/${project}_${tag}`
    };
    await axios.post(
        `/issue-credential/records/${credential_exchange_id}/store`,
        data,
        config
    );
}; // the credential is stored in the wallet in the holder agent which is not running in the github context but somewhere else #HOST_IP demo wise this explains the AWS stuff 

const main = async () => {
    const connection_id = await getConnectionId();
    const schemaId = await getLatestSchemaId();
    const digest = await getDigest();
    const proposal = {
        connection_id,
        cred_def_id: cred_def_id,
        issuer_did: issuer_did,
        issuer_schema_id: schemaId,
        namespace: namespace,
        repository: project,
        tag: tag,
        digest: digest,
    };
    let { credential_exchange_id } = await sendProposal(proposal);
    console.log("initial credential exchange id: " + credential_exchange_id);
    credential_exchange_id = await waitForOfferReceived(
        connection_id,
        credential_exchange_id
    );

    console.log(
        "credential exchange id once offer recieved: " + credential_exchange_id
    );

    await confirmOffer(credential_exchange_id);
    console.log(
        "credential exchange id:  once offer confirmed" + credential_exchange_id
    );

    credential_exchange_id = await waitForCredentialReceived(
        connection_id,
        credential_exchange_id
    );

    await storeCredential(credential_exchange_id, tag);
};

main()
    .then(() => console.log("Done"))
    .catch((err) => console.error(err));