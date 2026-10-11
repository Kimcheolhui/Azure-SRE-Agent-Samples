---
name: payment-investigation
description: Investigate payment API failures and latency using deployment identity and method-specific evidence.
---

# Payment investigation

Use for payment API failures or latency.

1. Ask for the resource ID and UTC time window if missing.
2. Read Deployment/Pod image digest and `/version` evidence to verify deployed commit and Pod identity.
3. Query payment requests by card/bank and compare p95 and failures.
4. Inspect provider dependencies and exceptions in that same time window.
5. Compare Deployment revisions, Pod events and Kubernetes audit timestamps. Do not infer a code deployment from an environment rollout.
6. List at least two hypotheses, supporting and contradicting evidence, and missing sources.
7. Propose the smallest reversible mitigation. Do not change resources during this investigation.
8. Require user-approved recovery checks: both methods 0 failures and p95 <= 1,000 ms over 20 paired rounds.
9. Inspect Pod waiting states, image digest, registry permissions and network when container startup fails.
   Distinguish failed deployment from the health of available Pods.

Output: resource, UTC window, commit, observed symptom, evidence queries, hypotheses,
proposed action, approval requirement, recovery criterion and owner.
