#!/usr/bin/env python3
"""Extraction ZIP défensive pour les archives de projets HTML RENDRAX.

Aucune dépendance externe : refuse les chemins dangereux, les liens symboliques,
les fichiers spéciaux, les doublons et les archives dépassant les limites définies.
"""
import argparse
import os
import re
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_ARCHIVE_BYTES = 50 * 1000 * 1000
MAX_ENTRIES = 2000
MAX_TOTAL_BYTES = 250 * 1000 * 1000
MAX_FILE_BYTES = 100 * 1000 * 1000
CHUNK_SIZE = 1024 * 1024


class UnsafeArchive(ValueError):
    """Archive refusée pour des raisons de sécurité ou de limites."""


def safe_relative_path(raw_name):
    if not raw_name or "\x00" in raw_name:
        raise UnsafeArchive("Nom de fichier vide ou contenant un octet NUL.")
    if any(ord(char) < 32 or ord(char) == 127 for char in raw_name):
        raise UnsafeArchive("Le nom d’un élément ZIP contient un caractère de contrôle.")

    name = raw_name.replace("\\", "/")
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        raise UnsafeArchive(f"Chemin absolu interdit dans le ZIP : {raw_name!r}")

    raw_parts = name.split("/")
    is_directory = name.endswith("/")
    if is_directory:
        raw_parts = raw_parts[:-1]
    parts = []
    for part in raw_parts:
        if part == "":
            raise UnsafeArchive(f"Chemin ZIP ambigu interdit : {raw_name!r}")
        if part == "..":
            raise UnsafeArchive(f"Chemin sortant du dossier interdit : {raw_name!r}")
        if part == ".":
            continue
        parts.append(part)
    if not parts:
        raise UnsafeArchive(f"Chemin ZIP vide ou ambigu : {raw_name!r}")
    return PurePosixPath(*parts), is_directory


def extract_archive(archive_path, destination, selected_html):
    archive_path = Path(archive_path)
    destination = Path(destination)
    if not archive_path.is_file():
        raise UnsafeArchive("Archive ZIP introuvable.")
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise UnsafeArchive("Archive ZIP trop volumineuse (50 Mo maximum).")

    selected_path, selected_is_dir = safe_relative_path(selected_html)
    if selected_is_dir or selected_path.suffix.lower() not in (".html", ".htm"):
        raise UnsafeArchive("Le fichier HTML principal doit être un fichier .html ou .htm.")

    root = destination.resolve()
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=False)

    explicit_entries = {}
    declared_total = 0
    actual_total = 0
    entry_count = 0

    try:
        with zipfile.ZipFile(archive_path, "r") as bundle:
            infos = bundle.infolist()
            if len(infos) > MAX_ENTRIES:
                raise UnsafeArchive(f"Trop d’éléments dans le ZIP (maximum {MAX_ENTRIES}).")

            for info in infos:
                entry_count += 1
                rel_path, named_as_directory = safe_relative_path(info.filename)
                key = rel_path.as_posix()
                unix_mode = (info.external_attr >> 16) & 0xFFFF
                kind = stat.S_IFMT(unix_mode)
                directory = named_as_directory or info.is_dir() or kind == stat.S_IFDIR

                if kind == stat.S_IFLNK:
                    raise UnsafeArchive(f"Lien symbolique interdit dans le ZIP : {info.filename!r}")
                if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise UnsafeArchive(f"Fichier spécial interdit dans le ZIP : {info.filename!r}")
                if kind == stat.S_IFREG and directory:
                    raise UnsafeArchive(f"Type de fichier incohérent dans le ZIP : {info.filename!r}")
                if key in explicit_entries:
                    raise UnsafeArchive(f"Chemin dupliqué dans le ZIP : {info.filename!r}")
                explicit_entries[key] = directory

                target = root.joinpath(*rel_path.parts)
                resolved = target.resolve()
                if os.path.commonpath((str(root), str(resolved))) != str(root):
                    raise UnsafeArchive(f"Chemin sortant du dossier d’extraction : {info.filename!r}")

                if directory:
                    if info.file_size != 0:
                        raise UnsafeArchive(f"Entrée de dossier non vide interdite : {info.filename!r}")
                    target.mkdir(parents=True, exist_ok=True)
                    continue

                if info.file_size < 0 or info.file_size > MAX_FILE_BYTES:
                    raise UnsafeArchive(f"Fichier trop volumineux dans le ZIP : {info.filename!r}")
                declared_total += info.file_size
                if declared_total > MAX_TOTAL_BYTES:
                    raise UnsafeArchive("Le contenu décompressé dépasse 250 Mo.")

                target.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                with bundle.open(info, "r") as source, target.open("xb") as output:
                    while True:
                        chunk = source.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        written += len(chunk)
                        actual_total += len(chunk)
                        if written > MAX_FILE_BYTES:
                            raise UnsafeArchive(f"Fichier décompressé trop volumineux : {info.filename!r}")
                        if actual_total > MAX_TOTAL_BYTES:
                            raise UnsafeArchive("Le contenu décompressé dépasse 250 Mo.")
                        output.write(chunk)
                if written != info.file_size:
                    raise UnsafeArchive(f"Taille incohérente après extraction : {info.filename!r}")

        main_file = root.joinpath(*selected_path.parts)
        if not main_file.is_file() or main_file.is_symlink():
            raise UnsafeArchive("Le HTML principal sélectionné est absent du ZIP.")
        print(str(main_file))
        return str(main_file)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, help="Chemin de l’archive ZIP source")
    parser.add_argument("--dest", required=True, help="Dossier de destination temporaire")
    parser.add_argument("--main", required=True, help="Chemin relatif du HTML principal dans l’archive")
    args = parser.parse_args()
    try:
        extract_archive(args.archive, args.dest, args.main)
    except Exception as error:
        print(f"Extraction ZIP refusée ou impossible : {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
