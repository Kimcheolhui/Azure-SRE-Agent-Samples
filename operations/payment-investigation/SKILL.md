---
name: payment-investigation
description: Investigate the workshop payment API using deployment identity and method-specific request and dependency evidence.
---

# Payment investigation

Use for payment symptoms in a dedicated `rg-sre-workshop-*` resource group.

1. Ask for the resource ID and UTC time window if missing.
2. Read Deployment/Pod image digest and `/version` evidence to verify deployed commit, scenario and Pod identity.
3. Query payment requests by card/bank and compare p95 and failures.
4. Inspect provider dependencies and exceptions in that same time window.
5. Compare Deployment revisions, Pod events and Kubernetes audit timestamps. Do not infer a code deployment from an environment rollout.
6. List at least two hypotheses, supporting and contradicting evidence, and missing sources.
7. Propose the smallest reversible mitigation. Do not change resources during this investigation.
8. Require user-approved recovery checks: both methods 0 failures and p95 <= 1,000 ms over 20 paired rounds.
9. For image pull failures, inspect new Pod waiting reason, ACR tag/digest, kubelet AcrPull and network.
   Distinguish failed rollout from the health of old available Pods. Do not delete the cluster or namespace.

Output: resource, UTC window, commit, observed symptom, evidence queries, hypotheses,
proposed action, approval requirement, recovery criterion and owner.
