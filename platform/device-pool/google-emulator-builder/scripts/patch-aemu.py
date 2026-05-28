#!/usr/bin/env python3
"""Apply Zeppole fixes to vendored android-emulator-container-scripts."""
from __future__ import annotations

import sys
from pathlib import Path

AEMU = Path("/opt/aemu")


def patch_system_image_container() -> None:
    path = AEMU / "emu/containers/system_image_container.py"
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        'assert "ro.build.version.incremental" in self.system_image_zip.props',
        '# Zeppole: incremental label optional on newer system images',
    )
    text = text.replace(
        'return self.system_image_zip.props["ro.build.version.incremental"]',
        'return self.system_image_zip.props.get("ro.build.version.incremental") or '
        'self.system_image_zip.props.get("ro.build.version.sdk") or "latest"',
    )
    old = """        if super().available():
            return self.image_labels()["ro.build.version.incremental"]

        # Unknown, revert to latest.
        return "latest\""""
    new = """        if super().available():
            labels = self.image_labels()
            return (
                labels.get("ro.build.version.incremental")
                or labels.get("ro.build.version.sdk")
                or "latest"
            )

        # Unknown, revert to latest.
        return "latest\""""
    if old not in text:
        raise RuntimeError("system_image_container.py: expected docker_tag branch missing")
    text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def patch_emu_docker() -> None:
    path = AEMU / "emu/emu_docker.py"
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        'sys_docker.build(args.dest / "sys_img")',
        'sys_docker.build(Path(args.dest) / "sys_img")',
    )

    old = """        sys_docker = SystemImageContainer(img, args.repo)
        if not sys_docker.available() and not sys_docker.can_pull():
            sys_docker.build(Path(args.dest) / "sys_img")
        else:
            logging.info(
                "Image %s is local: %s, pull: %s",
                sys_docker,
                sys_docker.available(),
                sys_docker.can_pull(),
            )
            print(f"No need to build {sys_docker}, it's already available")"""

    new = """        sys_docker = SystemImageContainer(img, args.repo)
        needs_sys_build = True
        if sys_docker.available():
            labels = sys_docker.image_labels()
            if labels.get("ro.build.version.incremental") or labels.get("ro.build.version.sdk"):
                needs_sys_build = False
            else:
                logging.warning(
                    "Local system image %s is missing build labels; removing and rebuilding",
                    sys_docker,
                )
                local = sys_docker.docker_image()
                if local:
                    sys_docker.get_client().images.remove(local.id, force=True)
                needs_sys_build = True
        else:
            try:
                needs_sys_build = not sys_docker.can_pull()
            except (KeyError, TypeError):
                needs_sys_build = True
        if needs_sys_build:
            sys_docker.build(Path(args.dest) / "sys_img")
        else:
            logging.info(
                "Image %s is local: %s, pull: %s",
                sys_docker,
                sys_docker.available(),
                sys_docker.can_pull(),
            )
            print(f"No need to build {sys_docker}, it's already available")"""

    if old not in text:
        raise RuntimeError("emu_docker.py: create_docker_image block not found")
    text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def patch_emulator_container() -> None:
    """Fix qemu.short_tag inconsistency for ps16k images.

    The ps16k system image zip's source.properties carries qemu.short_tag='google'
    (inherited from the google_apis base variant) while SysImgInfo.image_name() uses
    'playstore' (derived from the path).  The emulator container Dockerfile would
    then reference e.g. FROM sys-35-google-x64-ps16k which does not exist locally.
    Override with path-derived values from SysImgInfo when available.
    """
    path = AEMU / "emu/containers/emulator_container.py"
    text = path.read_text(encoding="utf-8")

    old = (
        '        self.props = system_image_container.image_labels()\n'
        '        self.props["playstore"] = self.props["qemu.tag"] == "google_apis_playstore"'
    )
    new = (
        '        self.props = system_image_container.image_labels()\n'
        '        # Zeppole: ps16k image source.properties may carry qemu.short_tag from\n'
        '        # the base google_apis variant ("google") while the sys image Docker tag\n'
        '        # was derived from the path ("playstore").  Override with path values.\n'
        '        if (\n'
        '            hasattr(system_image_container, "system_image_info")\n'
        '            and system_image_container.system_image_info is not None\n'
        '        ):\n'
        '            _si = system_image_container.system_image_info\n'
        '            self.props["qemu.short_tag"] = _si.short_tag()\n'
        '            self.props["qemu.short_abi"] = _si.short_abi()\n'
        '            self.props["qemu.tag"] = _si.tag\n'
        '            self.props["qemu.is_16k"] = "true" if _si.is_16k else "false"\n'
        '        self.props["playstore"] = self.props["qemu.tag"] == "google_apis_playstore"'
    )

    if old not in text:
        raise RuntimeError("emulator_container.py: expected props assignment not found")
    text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    patch_system_image_container()
    patch_emu_docker()
    patch_emulator_container()
    print("[zeppole] Applied aemu patches", file=sys.stderr)


if __name__ == "__main__":
    main()
