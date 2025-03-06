package function

import (
	"fmt"
	"io"
	"net/http"
)

// Handle a serverless request
//
//goland:noinspection GoUnusedExportedFunction
func Handle(w http.ResponseWriter, r *http.Request) {
	reqBody, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Unable to read request body", http.StatusBadRequest)
		return
	}
	fmt.Fprintf(w, "Hello, GitHub Actions v19. You said: %s", string(reqBody))
}
