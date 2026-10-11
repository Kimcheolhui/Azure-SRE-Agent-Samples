import json
import math


def main(samples_json: str) -> dict:
    """Summarize caller-provided measurements; never query or change Azure."""
    if not isinstance(samples_json, str):
        raise ValueError("samples_json must be a JSON string")
    samples = json.loads(samples_json)
    if not isinstance(samples, list) or not 1 <= len(samples) <= 10000:
        raise ValueError("Provide 1-10000 payment measurement objects")
    groups = {"card": [], "bank": []}
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"Measurement {index} must be an object")
        method = sample.get("method")
        duration = sample.get("durationMs")
        status = sample.get("status")
        if not isinstance(method, str) or method not in groups:
            raise ValueError(f"Measurement {index} has an unsupported method")
        if (isinstance(duration, bool) or not isinstance(duration, (int, float))
                or not math.isfinite(duration) or duration < 0):
            raise ValueError(f"Measurement {index} requires finite nonnegative durationMs")
        if isinstance(status, bool) or not isinstance(status, int) or not 100 <= status <= 599:
            raise ValueError(f"Measurement {index} requires an integer HTTP status")
        groups[method].append((duration, status))
    results = {}
    for method, rows in groups.items():
        durations = sorted(row[0] for row in rows)
        failures = sum(status >= 400 for _, status in rows)
        results[method] = {
            "count": len(rows),
            "failures": failures,
            "failureRate": failures / len(rows) if rows else None,
            "p95Ms": durations[math.ceil(len(rows) * 0.95) - 1] if rows else None,
        }
    missing = [method for method, rows in groups.items() if not rows]
    recovered = not missing and all(
        result["failures"] == 0 and result["p95Ms"] <= 1000
        for result in results.values()
    )
    return {
        "methods": results,
        "missingMethods": missing,
        "recovered": recovered,
        "percentileDefinition": "nearest-rank",
        "note": "Caller-provided measurements only; does not independently prove Azure recovery.",
    }
