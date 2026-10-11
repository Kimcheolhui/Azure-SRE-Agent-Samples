import json


def main(pods_json: str) -> dict:
    """Summarize caller-provided PodList from the fixed payments namespace."""
    document = json.loads(pods_json)
    if not isinstance(document, dict) or document.get("kind") not in ("List", "PodList"):
        raise ValueError("Provide kubectl get pods -o json output with kind List or PodList")
    items = document.get("items")
    if not isinstance(items, list):
        raise ValueError("PodList.items must be an array")
    result = []
    for pod in items:
        if not isinstance(pod, dict):
            raise ValueError("Each Pod must be an object")
        if document["kind"] == "List" and pod.get("kind") != "Pod":
            raise ValueError("A Kubernetes List must contain only Pod objects")
        metadata = pod.get("metadata", {})
        if not isinstance(metadata, dict):
            raise ValueError("Pod metadata must be an object")
        if metadata.get("namespace") != "payments":
            raise ValueError("Only payments namespace measurements are accepted")
        status = pod.get("status", {})
        if not isinstance(status, dict):
            raise ValueError("Pod status must be an object")
        statuses = status.get("containerStatuses", [])
        if not isinstance(statuses, list) or any(not isinstance(container, dict) for container in statuses):
            raise ValueError("Pod containerStatuses must be an array of objects")
        result.append({
            "pod": metadata.get("name"),
            "phase": status.get("phase"),
            "deleting": bool(metadata.get("deletionTimestamp")),
            "containers": [
                {"name": container.get("name"), "ready": container.get("ready") is True,
                 "restarts": container.get("restartCount"),
                 "waitingReason": container.get("state", {}).get("waiting", {}).get("reason"),
                 "imageID": container.get("imageID")}
                for container in statuses
            ],
        })
    return {"pods": result, "count": len(result),
            "note": "Caller-provided Pod status only; does not independently query AKS or prove payment recovery."}
