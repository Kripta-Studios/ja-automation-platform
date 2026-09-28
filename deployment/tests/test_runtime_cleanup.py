import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "jaautomation-runtime-cleanup.py"
SPEC = importlib.util.spec_from_file_location("jaautomation_runtime_cleanup", SCRIPT)
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)


class RuntimeCleanupTests(unittest.TestCase):
    def test_keeps_active_and_two_latest_processed_releases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            releases = root / "releases"
            releases.mkdir()
            state = root / "processed.sha256"
            current = root / "current"
            paths = {}
            for index, letter in enumerate("abcdef", start=1):
                path = releases / f"ja-automation-{letter * 64}"
                path.mkdir()
                (path / "package.json").write_text("{}")
                os.utime(path, ns=(index * 1_000_000_000, index * 1_000_000_000))
                paths[letter] = path
            current.symlink_to(paths["f"], target_is_directory=True)
            state.write_text("\n".join(letter * 64 for letter in "abcdf") + "\n")

            removed, skipped = cleanup.prune_releases(releases, current, state)

            self.assertEqual((removed, skipped), (2, 1))
            self.assertEqual(
                {path.name for path in releases.iterdir()},
                {paths[letter].name for letter in "cdef"},
            )

    def test_rejects_symlinked_release_without_deleting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            releases = root / "releases"
            releases.mkdir()
            state = root / "processed.sha256"
            current = root / "current"
            active = releases / f"ja-automation-{'a' * 64}"
            active.mkdir()
            current.symlink_to(active, target_is_directory=True)
            outside = root / "outside"
            outside.mkdir()
            linked = releases / f"ja-automation-{'b' * 64}"
            linked.symlink_to(outside, target_is_directory=True)
            state.write_text("a" * 64 + "\n" + "b" * 64 + "\n")

            with self.assertRaisesRegex(RuntimeError, "unsafe release entry"):
                cleanup.prune_releases(releases, current, state)
            self.assertTrue(active.is_dir())
            self.assertTrue(outside.is_dir())


if __name__ == "__main__":
    unittest.main()
