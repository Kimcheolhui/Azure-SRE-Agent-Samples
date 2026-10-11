import json


def main(pods_json: str) -> dict:
    """Summarize caller-provided PodList from the fixed workshop namespace."""
    document = json.loads(pods_json)
    if not isinstance(document, dict) or document.get("kind") != "PodList":
        raise ValueError("Provide kubectl get pods -o json output with kind PodList")
    items = document.get("items")
    if not isinstance(items, list):
        raise ValueError("PodList.items must be an array")
    result = []
    for pod in items:
        if not isinstance(pod, dict):
            raise ValueError("Each Pod must be an object")
        metadata = pod.get("metadata", {})
        if metadata.get("namespace") != "sre-workshop":
            raise ValueError("Only sre-workshop namespace measurements are accepted")
        statuses = pod.get("status", {}).get("containerStatuses", [])
        result.append({
            "pod": metadata.get("name"),
            "phase": pod.get("status", {}).get("phase"),
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
