---
name: "RENDRAX"
slug: "rendrax"
version: "Version web continue — aucun numéro de version public déclaré"
status: "En ligne"
category: "Outil de développement"
author: "KIDAS"
license: "Propriétaire — voir LICENSE"
platforms:
  - "Web"
  - "PWA installable sur les appareils compatibles"
  - "Linux (moteur CLI, selon dépendances)"
  - "Android via navigateur ou installation PWA ; moteur CLI via Termux, selon dépendances"
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
download: "Application web et PWA ; aucun installateur autonome ni APK publié"
icon: "https://rendrax.vercel.app/favicon-32x32.png"
pwa_icons:
  - "https://rendrax.vercel.app/pwa-192.png"
  - "https://rendrax.vercel.app/pwa-512.png"
  - "https://rendrax.vercel.app/pwa-maskable-512.png"
cover: "Aucune image Open Graph dédiée configurée"
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
- Application web progressive (PWA), installable depuis les navigateurs compatibles.
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
- **PWA** : installation possible depuis un navigateur compatible ; la disponibilité des fonctions dépend du navigateur et de l'appareil.
- **Android** : utilisation dans le navigateur ou installation comme PWA. Aucun APK natif autonome n'est publié.
- **Linux** : certains composants du moteur peuvent être exécutés en ligne de commande si les dépendances nécessaires sont installées.
- **Android via Termux** : exécution du moteur en ligne de commande possible sous réserve de la disponibilité et de la compatibilité de Python, Chromium et FFmpeg. L'interface complète reste une application web.

# Licence et propriété

RENDRAX est un projet propriétaire. Il n'est publié sous aucune licence open source.

La copie, la modification, l'adaptation, la redistribution, la création d'œuvres dérivées et l'exploitation non autorisée sont interdites sans accord écrit préalable du titulaire des droits.

Le texte complet de la licence, en anglais et en français, se trouve dans le fichier [LICENSE](https://github.com/kidasniger/RENDRAX/blob/main/LICENSE).

Copyright : © 2026 KIDAS. Tous droits réservés.

# Guide de préparation HTML

Documentation : https://rendrax.vercel.app/preparer-html.html

Le guide couvre notamment la structure du document HTML, le choix du fichier principal, la durée et le déclenchement des animations, l'intégration audio, les animations utilisant GSAP ou Canvas, les ressources externes et la vérification du fichier avant le rendu.

# Captures d'écran

Aucune capture d'écran dédiée n'est actuellement référencée dans le dépôt. Cette rubrique sera complétée lorsque des captures réelles de l'application seront publiées.

# Vidéos de présentation

Aucune vidéo de présentation officielle n'est actuellement référencée.

# Téléchargements et installation

RENDRAX est distribué sous forme d'application web et de PWA. Il n'existe actuellement aucun paquet autonome publié pour Android, Windows, Linux ou macOS.

- **Application web** : https://rendrax.vercel.app
- **Installation PWA** : utiliser la fonction « Installer l'application » ou « Ajouter à l'écran d'accueil » du navigateur compatible.
- **APK Android** : non publié.
- **Installateur Windows** : non publié.
- **Paquet Linux** : non publié.
- **Application macOS** : non publiée.

# Icônes

- Favicon 16 × 16 : https://rendrax.vercel.app/favicon-16x16.png
- Favicon 32 × 32 : https://rendrax.vercel.app/favicon-32x32.png
- Icône PWA 192 × 192 : https://rendrax.vercel.app/pwa-192.png
- Icône PWA 512 × 512 : https://rendrax.vercel.app/pwa-512.png
- Icône PWA maskable 512 × 512 : https://rendrax.vercel.app/pwa-maskable-512.png
- Icône Apple Touch : https://rendrax.vercel.app/apple-touch-icon.png

# Liens officiels

- Application : https://rendrax.vercel.app
- Dépôt GitHub : https://github.com/kidasniger/RENDRAX
- Licence : https://github.com/kidasniger/RENDRAX/blob/main/LICENSE
- Guide HTML : https://rendrax.vercel.app/preparer-html.html
- Informations et conditions : https://rendrax.vercel.app/legal.html
- Documentation complémentaire : aucune documentation distincte publiée à ce jour.
- YouTube : aucune chaîne ou vidéo officielle renseignée.
- Réseaux sociaux : aucun lien officiel renseigné.

# Version et mises à jour

RENDRAX est actuellement déployé comme application web à mise à jour continue. Aucun numéro de version applicative public ni paquet de version téléchargeable n'est déclaré dans le dépôt. Les mises à jour de l'application web sont publiées via le déploiement Vercel depuis le dépôt GitHub.

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
- Ajout de la licence propriétaire bilingue.

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

Aucune image Open Graph dédiée n'est configurée dans les métadonnées actuelles de la page d'accueil.

## Canonical URL

https://rendrax.vercel.app/

# Informations supplémentaires

- Le dépôt source du projet est https://github.com/kidasniger/RENDRAX.
- L'application publique est hébergée sur Vercel à l'adresse https://rendrax.vercel.app.
- Les transferts de fichiers entrants utilisent Backblaze B2 et des URL signées ; les secrets de stockage restent configurés dans les variables d'environnement et ne sont pas documentés ici.
- Le workflow de rendu est déclenché via GitHub Actions.
- Le déploiement de production des modifications documentées le 5 novembre 2026 a été signalé comme READY sur Vercel.
- Le projet est propriétaire et sa licence est disponible dans le fichier LICENSE.
- Aucun numéro de version public, APK, installateur autonome, capture d'écran dédiée, vidéo de présentation, chaîne YouTube ou lien de réseau social officiel n'est actuellement déclaré dans le dépôt.
- L'identité juridique complète et les coordonnées officielles de l'exploitant ne sont pas précisées dans les fichiers du projet.
- Les pages légales constituent une information générale et doivent être complétées par les informations officielles de l'exploitant si une conformité juridique complète est requise.
