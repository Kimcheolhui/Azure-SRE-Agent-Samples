# Payment workshop service context

Owner: the learner. Environment: disposable Azure workshop only.

## Architecture

Internet client -> Linux App Service `sre-payment-api` -> HTTP `/provider` on the same process.
The provider is an explicit local simulation, NOT a real bank, external payment system or database.
There are no real purchases, customer data, storage or payment secrets.

## Deployment identity

`GET /version` returns `sourceCommit` and `scenario`.
`SOURCE_COMMIT` must match the deployed Git commit, not the current repository HEAD inferred by an agent.
`SRE_SCENARIO` is an App Service application setting. Changing it restarts the process.
Configuration change is the fault injection mechanism; code does not need to change between scenarios.

## Baseline and faults

- `healthy`: card/bank return 200; local `/provider` usually takes about 15 ms.
- `dependency-slow`: card provider waits 1,800 ms, bank stays fast; health stays 200.
- `payment-exception`: card returns 500 with `WORKSHOP_PAYMENT_CONFIG_ERROR`; bank stays 200.
- `unavailable`: both payment methods and `/health` return 503; `/version` stays 200 for diagnosis.

## Recovery criterion

Reset only `SRE_SCENARIO=healthy`, restart, verify `/version`, then run 20 paired rounds.
Both methods must have 0 failures and measured p95 <= 1,000 ms.
This local-workshop threshold is not an Azure latency guarantee.
Check fresh Application Insights evidence after ingestion; do not mistake historical errors for an ongoing fault.

## Boundaries

Review mode first. Never delete a resource or modify a non-workshop resource group.
Read-only diagnosis does not authorize changes. User approval does not grant missing Azure RBAC.
Do not disable an alert merely to make the incident look resolved.
Record UTC start/end, resource ID, scenario, commit, evidence, action, owner and remaining questions.
