---
name: "RENDRAX"
slug: "rendrax"
version: "À renseigner"
status: "En ligne"
category: "Outil de développement"
author: "KIDAS"
license: "À renseigner"
platforms:
  - "Web"
  - "Linux (moteur CLI, selon dépendances)"
  - "Android via Termux (moteur CLI, selon dépendances)"
technologies:
  - "HTML"
  - "CSS"
  - "JavaScript"
  - "Node.js"
  - "Python"
  - "Chromium"
  - "FFmpeg"
  - "Vercel Functions"
  - "Backblaze B2"
  - "GitHub Actions"
  - "Cloudflare Turnstile"
github: "https://github.com/kidasniger/RENDRAX"
demo: "https://rendrax.vercel.app"
website: "https://rendrax.vercel.app"
documentation: "https://rendrax.vercel.app/preparer-html.html"
download: "À renseigner"
icon: "À vérifier"
cover: "À renseigner"
---

# Description

RENDRAX est une application web qui transforme des animations HTML en vidéos MP4. L'utilisateur importe un fichier HTML ou une archive ZIP, vérifie et prévisualise son contenu, configure le rendu, puis lance le traitement sur l'infrastructure serveur. Chromium exécute et capture les animations ; FFmpeg encode la vidéo et assemble les pistes audio disponibles. Certains profils d'animation reconnus peuvent être traités image par image pour mieux maîtriser la chronologie et la synchronisation. Les pages HTML génériques sont rendues en temps réel : leur fluidité et leur synchronisation audio dépendent de leur implémentation.

L'application est accessible depuis un navigateur à l'adresse https://rendrax.vercel.app.

# Description courte

RENDRAX convertit des animations HTML en vidéos MP4. Importe un fichier HTML ou ZIP, configure le format, la résolution, la durée et l'audio, puis génère et partage ta vidéo.

# Fonctionnalités

## Import et préparation

- Importer un fichier HTML/HTM ou une archive ZIP.
- Accepter les fichiers jusqu'à 50 Mo.
- Importer une page à partir d'une URL lorsque la source est accessible et compatible.
- Vérifier le fichier importé et détecter les ressources ou profils d'animation pris en charge.
- Prévisualiser la page HTML avant le rendu.
- Consulter un rapport de compatibilité et les conseils de préparation du HTML.

## Configuration du rendu

- Choisir le format de sortie : automatique, portrait, paysage ou carré.
- Choisir l'échelle de rendu disponible.
- Définir une durée maximale parmi les durées proposées.
- Activer ou désactiver le filigrane.
- Activer ou désactiver la normalisation audio.
- Régler le décalage audio dans la plage acceptée par le serveur.
- Lancer un rendu de test avant le rendu final.
- Ajuster les paramètres avancés et réinitialiser les préférences de rendu.

## Génération et gestion des vidéos

- Déclencher le rendu avec GitHub Actions.
- Exécuter les animations avec Chromium et encoder les résultats avec FFmpeg.
- Suivre l'état et la progression du traitement depuis l'interface.
- Consulter les informations et le journal associés au rendu.
- Annuler un traitement lorsque l'action est disponible.
- Prévisualiser, télécharger et partager une vidéo générée.
- Consulter la bibliothèque des vidéos et actualiser la liste.
- Supprimer une vidéo depuis l'interface.
- Générer des liens de partage temporaires ; les métadonnées de partage sont configurées pour expirer après 30 jours.

## Expérience et accessibilité

- Interface disponible en français et en anglais, avec changement de langue sans rechargement.
- Interface web adaptée aux écrans mobiles et aux ordinateurs.
- FAQ intégrée.
- Guide de préparation des fichiers HTML.
- Pages d'information sur la confidentialité et les conditions d'utilisation.
- Signalement de problème depuis l'interface avec les informations de diagnostic utiles ; le fichier utilisateur n'est pas ajouté automatiquement au signalement.

# Technologies et architecture

- **HTML, CSS et JavaScript** : interface web et logique côté navigateur.
- **Node.js** : fonctions API côté serveur.
- **Python** : orchestration et outils du moteur de rendu.
- **Chromium** : chargement, exécution et capture des pages HTML.
- **FFmpeg** : encodage MP4 et traitement audio.
- **Vercel Functions** : endpoints serveur pour l'import, la préparation, le suivi et la gestion des vidéos.
- **Backblaze B2** : stockage objet des fichiers entrants, vidéos, miniatures et métadonnées ; les transferts utilisent des URL signées.
- **GitHub Actions** : exécution du workflow de rendu sur la branche principale.
- **Cloudflare Turnstile** : protection anti-robot des opérations sensibles.
- **Vercel Cron** : déclenchement planifié du nettoyage des ressources obsolètes.

# Stockage et durée de conservation

- Les fichiers HTML et ZIP importés sont déposés dans un espace privé Backblaze B2 via une URL temporaire signée.
- Le serveur vérifie la présence et la taille du fichier avant de déclencher le rendu.
- Les vidéos et leurs miniatures sont stockées séparément des fichiers entrants.
- Les liens de partage des vidéos et leurs métadonnées sont limités dans le temps ; la durée configurée est de 30 jours.
- Un nettoyage planifié traite les ressources obsolètes.
- La suppression d'une vidéo peut être demandée depuis l'interface.

La durée de conservation effective des fichiers entrants et les détails de purge peuvent dépendre du workflow et de la configuration du stockage.

# Plateformes

- **Web** : application complète hébergée sur Vercel.
- **Linux** : certains composants du moteur peuvent être exécutés en ligne de commande si les dépendances nécessaires sont installées.
- **Android via Termux** : exécution du moteur en ligne de commande possible sous réserve de la disponibilité et de la compatibilité de Python, Chromium et FFmpeg. L'interface complète reste une application web.

# Guide de préparation HTML

Documentation : https://rendrax.vercel.app/preparer-html.html

Le guide couvre notamment la structure du document HTML, le choix du fichier principal, la durée et le déclenchement des animations, l'intégration audio, les animations utilisant GSAP ou Canvas, les ressources externes et la vérification du fichier avant le rendu.

# Captures d'écran

- À renseigner

# Vidéos

- À renseigner

# Téléchargements

RENDRAX est actuellement distribué comme application web. Aucun paquet Android, Windows, Linux ou macOS autonome n'est renseigné dans ce fichier.

## Android

- URL : À renseigner
- Version : À renseigner
- Architecture : À renseigner
- Taille : À renseigner

## Windows

- URL : À renseigner
- Version : À renseigner
- Architecture : À renseigner
- Taille : À renseigner

## Linux

- URL : À renseigner
- Version : À renseigner
- Architecture : À renseigner
- Taille : À renseigner

## macOS

- URL : À renseigner
- Version : À renseigner
- Architecture : À renseigner
- Taille : À renseigner

# Liens

- Application : https://rendrax.vercel.app
- Dépôt GitHub : https://github.com/kidasniger/RENDRAX
- Guide HTML : https://rendrax.vercel.app/preparer-html.html
- Informations et conditions : https://rendrax.vercel.app/legal.html
- Documentation complémentaire : À renseigner
- YouTube : À renseigner
- Vidéo de présentation : À renseigner

# Nouveautés

## Interface et expérience utilisateur

- Ajout d'une base de design avec des variables cohérentes pour les espacements, les rayons, les ombres, les couleurs et la typographie.
- Harmonisation des boutons avec plusieurs variantes, tailles et états visuels.
- Amélioration des états de chargement et des explications associées aux commandes indisponibles.
- Ajout d'une numérotation dynamique des sections.

## Internationalisation et aide

- Ajout d'un sélecteur français/anglais sans rechargement.
- Ajout d'une FAQ accessible.
- Ajout du guide de préparation HTML.
- Ajout de pages d'information sur la confidentialité et les conditions d'utilisation.

## Suivi et retours

- Ajout d'un accès au signalement de problème depuis l'interface.
- Préremplissage du signalement avec des informations techniques utiles au diagnostic, sans joindre le fichier importé.
- Actualisation des libellés du statut de service selon la langue choisie.

# Changelog

## 2026-11-05 — Interface et documentation

- Intégration des améliorations d'interface et des tokens de design.
- Harmonisation des boutons et de leurs états.
- Ajout du changement de langue français/anglais.
- Ajout de la FAQ, du guide HTML et des pages d'information légales.
- Ajout du signalement de problème depuis l'application.
- Mise à jour de la documentation du projet et de son architecture de stockage.

# SEO

## Title

RENDRAX — Convertir une animation HTML en vidéo MP4

## Description

Convertis tes animations HTML en vidéos MP4 avec RENDRAX. Importe un fichier HTML ou ZIP, configure le format, la durée et l'audio, puis génère et partage ta vidéo.

## Keywords

- RENDRAX
- Convertisseur HTML en MP4
- Animation HTML en vidéo
- Conversion HTML en vidéo
- HTML vers MP4
- Générateur vidéo HTML
- Génération de vidéo MP4
- Chromium
- FFmpeg

## Open Graph Image

À renseigner

## Canonical URL

https://rendrax.vercel.app/

# Informations supplémentaires

- Le dépôt source du projet est https://github.com/kidasniger/RENDRAX.
- L'application publique est hébergée sur Vercel à l'adresse https://rendrax.vercel.app.
- Les transferts de fichiers entrants utilisent Backblaze B2 et des URL signées ; les secrets de stockage restent configurés dans les variables d'environnement et ne sont pas documentés ici.
- Le workflow de rendu est déclenché via GitHub Actions.
- Le déploiement de production des modifications documentées le 5 novembre 2026 a été signalé comme READY sur Vercel.
- La version applicative, la licence, les captures, les téléchargements autonomes et les coordonnées officielles de l'exploitant restent à compléter.
- Les pages légales constituent une information générale et doivent être complétées par les informations officielles de l'exploitant si une conformité juridique complète est requise.
