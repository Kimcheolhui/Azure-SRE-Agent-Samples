import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("inspect_pods",
    Path(__file__).resolve().parents[1] / "inspect_pods.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PodInspectionTests(unittest.TestCase):
    def test_reports_ready_and_image_pull_failure_separately(self):
        result = module.main(json.dumps({"kind": "PodList", "items": [
            {"metadata": {"name": "old", "namespace": "sre-workshop"},
             "status": {"phase": "Running", "containerStatuses": [
                 {"name": "payment-api", "ready": True, "restartCount": 0,
                  "imageID": "example@sha256:abc", "state": {"running": {}}}]}},
            {"metadata": {"name": "new", "namespace": "sre-workshop"},
             "status": {"phase": "Pending", "containerStatuses": [
                 {"name": "payment-api", "ready": False, "restartCount": 0,
                  "state": {"waiting": {"reason": "ImagePullBackOff"}}}]}}
        ]}))
        self.assertEqual(result["count"], 2)
        self.assertTrue(result["pods"][0]["containers"][0]["ready"])
        self.assertEqual(result["pods"][1]["containers"][0]["waitingReason"], "ImagePullBackOff")

    def test_empty_list_is_not_a_recovery_claim(self):
        result = module.main('{"kind":"PodList","items":[]}')
        self.assertEqual(result["count"], 0)
        self.assertNotIn("recovered", result)

    def test_rejects_bad_shape_and_other_namespaces(self):
        for value in ['[]', '{}', '{"kind":"PodList","items":null}',
                      '{"kind":"PodList","items":[{"metadata":{"namespace":"production"}}]}']:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    module.main(value)
