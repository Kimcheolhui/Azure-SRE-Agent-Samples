# Payment service

## Architecture

Namespace: `payments`.
`payment-api` receives GET `/pay?method=card|bank&amount=<number>` and calls
`payment-provider` through its ClusterIP Service using POST `/authorize`.
Each Deployment normally has two replicas. The provider derives the card
authorization signature using PBKDF2 and signs bank authorization using SHA-256.
This application does not persist settlements or contact a bank.

## Configuration and deployment

- `PAYMENT_PROVIDER_URL`: provider endpoint.
- `CARD_MERCHANT_ACCOUNT`, `BANK_MERCHANT_ACCOUNT`: payment-method merchant identities.
- `PROVIDER_REQUEST_TIMEOUT_MS`: API dependency request timeout.
- `SIGNATURE_ITERATIONS`: provider key derivation work factor.
- `SOURCE_COMMIT`: image source revision.

Check the deployed image digest, Pod imageID, and `/version` source revision.
Repository HEAD is not necessarily the deployed revision.
`/health` and `/version` check the API process; they do not prove payment success.
Deployment changes roll out Pods. Secret content is not restored by `rollout undo`.

## Investigation

Compare card/bank failure rate and latency, provider dependency duration/result,
exceptions, Pod/container logs, Deployment revisions, imageID and events within
the same UTC window. Inspect CPU usage and endpoint availability as appropriate.
App requests and Kubernetes inventory/audit are separate evidence sources.

## Change control

Changes require authorized identity, target-specific permissions and approval.
State which queries succeeded, which failed, and which data remains unavailable.
Confirm recovery using fresh payment requests and dependency evidence, not only
Pod readiness or a successful rollout. Preserve unrelated settings and resources.
