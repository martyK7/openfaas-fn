# busy wait on exchange to come in
import os
import time
import argparse
import requests

HOLDER_HOST_PORT = 8001


def check_for_exchange(holder_host: str) -> None:
    url = f"http://{holder_host}:{HOLDER_HOST_PORT}/present-proof/records"
    response = requests.get(url, timeout=5)
    data = response.json()
    if data["results"] != []:
        return True
    return False


def get_proof_and_credential(holder_host: str) -> None:
    url = f"http://{holder_host}:{HOLDER_HOST_PORT}/present-proof/records"
    response = requests.get(url,timeout=5)
    if response.status_code == 200:
        print(response.json())
    else:
        print(response.text)
    data = response.json()
    print(data)
    # extract holder presentation exchange id
    holder_presentation_id = data["results"][0]["presentation_exchange_id"]
    referent = data[0]["results"]["presentation"]["requested_proof"]["revealed_attrs"][
        "tag"
    ]["sub_proof_index"]
    url = f"http://{holder_host}:{HOLDER_HOST_PORT}/credentials"
    requests.get(url, timeout=5)
    return (holder_presentation_id, referent)


def send_credential(
    holder_host: str, holder_presentation_id: str, referent: str
) -> None:
    url = f"http://{holder_host}:{HOLDER_HOST_PORT}/present-proof/records/{holder_presentation_id}/send-presentation"
    payload = {
        "self_attested_attributes": {},
        "requested_attributes": {
            "tag": {"cred_id": f"{referent}", "revealed": "true"},
            "digest": {"cred_id": f"{referent}", "revealed": "true"},
            "namespace": {"cred_id": f"{referent}", "revealed": "true"},
            "repository": {"cred_id": f"{referent}", "revealed": "true"},
        },
        "requested_predicates": {},
    }
    headers = {"Content-Type": "application/json"}
    response = requests.post(url, json=payload, headers=headers, timeout=5)
    if response.status_code == 200:
        print("Credential sent successfully.")
    else:
        print(f"Failed to send credential: {response.text}")


def main(holder_host):
    seconds_to_wait = 30
    print(os.getenv("HOLDER_HOST"))
    holder_host = os.getenv("HOLDER_HOST") or holder_host
    while check_for_exchange(holder_host) is False and seconds_to_wait > 0:
        print(
            f"Waiting for exchange to come in. Will check again in {seconds_to_wait} seconds."
        )
        time.sleep(seconds_to_wait)
        if seconds_to_wait > 1:
            seconds_to_wait -= 1

    holder_presentation, referent = get_proof_and_credential(holder_host)
    send_credential(holder_host, holder_presentation, referent)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--holder-host", type=str, help="Holder URL")

    args = parser.parse_args()
    main(args.holder_host)
