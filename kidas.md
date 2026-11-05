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
video: "https://youtube.com/shorts/DHVj8d5E98g?si=lCbVwbi9G8aPP0yD"
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

Le workflow tente de supprimer les fichiers sources à la fin du traitement. Un nettoyage planifié cible les imports de plus de deux heures (cron Vercel quotidien à 03:17 UTC). Les vidéos publiées expirent après 30 jours ; un workflow GitHub Actions lancé toutes les six heures supprime les vidéos, miniatures et métadonnées expirées, avec une limite de 250 vidéos par exécution.

# Documentation technique détaillée

Documentation complète du moteur, des profils, des limites, de la sécurité, du traitement GitHub Actions et de la conservation des fichiers : https://rendrax.vercel.app/technique.html

## Profils d'animation détectés

Le moteur reconnaît cinq profils spécialisés par signatures de code :
- **KIDAS** : structure React attendue, scène `.stage`, audio intégré et durée déclarée.
- **EditPro** : canvas, fonction `render(t)` et voix encodée en base64.
- **MusicPro** : canvas, rendu piloté par le temps, voix et musique Web Audio.
- **Vidéo React** : API `window.__video`, méthode `seek()`, piste audio intégrée et durée déclarée.
- **Vidéo GSAP** : timeline GSAP en pause, progression temporelle pilotable, audio intégré et données de sous-titres.

Les autres pages exploitables passent en **mode universel**, avec capture en temps réel ; la synchronisation audio/vidéo n'est pas garantie.

## Bibliothèques JavaScript

Aucune liste générale de bibliothèques n'est certifiée compatible. Les scripts distants peuvent fonctionner s'ils sont accessibles depuis Chromium et compatibles avec ses API. GSAP, React, Canvas et Web Audio disposent de chemins spécialisés uniquement lorsque la structure de la page correspond aux signatures détectées ; les autres intégrations passent en mode universel.

## Paramètres et limites techniques

- HTML/ZIP importé : 50 Mo maximum.
- ZIP : 2 000 entrées maximum, 250 Mo décompressés au total et 100 Mo par fichier.
- Fréquence automatique : 60 i/s pour les profils synchronisés et 30 i/s pour le mode universel ; moteur CLI réglable de 1 à 120 i/s.
- Durée proposée dans l'interface : jusqu'à 5 minutes. En mode universel, 60 secondes sont utilisées par défaut si aucune durée n'est détectée.
- Décalage audio : −2 000 à +2 000 ms.
- MP4 publié : 500 Mo maximum ; miniature : 60 Ko maximum.
- Workflow GitHub Actions : délai maximal de 90 minutes.

Les performances varient selon la résolution, la durée, la complexité de l'animation, les ressources réseau et la charge du runner. Aucune vitesse de rendu fixe n'est garantie.

## Erreurs et reprise

Le moteur relance une fois certaines erreurs transitoires de Chromium, DevTools ou réseau. Les erreurs permanentes et les échecs FFmpeg ne sont pas automatiquement corrigés. L'interface peut reprendre le suivi d'un workflow existant, mais le rendu ne reprend pas à la dernière image : aucun système de checkpoint n'est implémenté.

## Sécurité et ressources externes

Les ZIP sont contrôlés contre les chemins dangereux, liens symboliques, fichiers spéciaux, doublons et dépassements de limites. Les imports par URL exigent HTTPS sur le port 443, refusent les adresses locales/privées, suivent au plus trois redirections, appliquent un délai de 20 secondes et une limite de 50 Mo.

Le HTML importé exécute du JavaScript dans Chromium : il doit être considéré comme du code actif. Le moteur Chromium est lancé avec `--no-sandbox` ; l'isolation n'est donc pas une garantie complète contre un contenu malveillant. Ne pas importer de fichiers non fiables ni de données sensibles. Les ressources externes peuvent échouer en raison du réseau, de CORS, d'une authentification ou d'une indisponibilité distante.

## Conservation et suppression

Les sources HTML/ZIP sont supprimées à la fin du job lorsque le nettoyage aboutit ; un nettoyage Vercel quotidien cible les sources de plus de deux heures. Les vidéos et miniatures expirent après 30 jours et le workflow de nettoyage s'exécute toutes les six heures (maximum 250 vidéos par exécution). La suppression manuelle retire la vidéo, sa miniature, ses métadonnées et les fichiers temporaires associés.

Les URL signées d'envoi expirent après 10 minutes et les URL signées de lecture/téléchargement après 5 minutes. Voir aussi les [conditions d'utilisation](https://rendrax.vercel.app/legal.html#terms).

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

- **Présentation officielle (YouTube Shorts)** : https://youtube.com/shorts/DHVj8d5E98g?si=lCbVwbi9G8aPP0yD


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
- YouTube : vidéo officielle de présentation — https://youtube.com/shorts/DHVj8d5E98g?si=lCbVwbi9G8aPP0yD
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

## 2026-11-05 — Interface, documentation et présentation

- Intégration des améliorations d'interface et des tokens de design.
- Harmonisation des boutons et de leurs états.
- Ajout du changement de langue français/anglais.
- Ajout de la FAQ, du guide HTML et des pages d'information légales.
- Ajout du signalement de problème depuis l'application.
- Mise à jour de la documentation du projet et de son architecture de stockage.
- Ajout de la licence propriétaire bilingue.
- Ajout du lien vers la vidéo officielle de présentation YouTube Shorts.
- Centralisation des liens de démonstration et de présentation dans la documentation.

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
- Aucun numéro de version public, APK, installateur autonome, capture d'écran dédiée, chaîne YouTube ou lien de réseau social officiel n'est actuellement déclaré dans le dépôt. Une vidéo officielle de présentation est désormais référencée dans cette documentation.
- L'identité juridique complète et les coordonnées officielles de l'exploitant ne sont pas précisées dans les fichiers du projet.
- Les pages légales constituent une information générale et doivent être complétées par les informations officielles de l'exploitant si une conformité juridique complète est requise.
