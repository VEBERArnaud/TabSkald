# Règles de confidentialité de TabSkald

_Dernière mise à jour : 8 novembre 2026_

TabSkald est une extension Chrome qui ouvre des groupes d’onglets définis par l’utilisateur au
démarrage de Chrome.

## Données traitées

TabSkald enregistre uniquement la configuration que vous créez : noms, couleurs et URL de vos
modèles de groupes, ainsi que le réglage d’ouverture automatique. Pour reconnaître un groupe déjà
ouvert ou importer un groupe existant, l’extension lit localement l’adresse des onglets ouverts,
sans la conserver ni la transmettre.

## Stockage et synchronisation

La configuration est enregistrée dans le stockage d’extension fourni par Chrome
(`chrome.storage.sync`). Si la synchronisation Chrome est activée, Chrome la synchronise entre vos
appareils avec votre compte Google, selon les règles de confidentialité de Google. L’état
temporaire d’exécution reste sur votre appareil et est effacé à la fermeture de Chrome.

## Ce que TabSkald ne fait pas

- Aucune donnée n’est envoyée au développeur ni à un tiers.
- Aucune requête réseau, aucune télémétrie, aucun suivi, aucune publicité.
- Aucun accès au contenu des pages : l’extension n’injecte aucun script.
- Aucune donnée n’est vendue ni utilisée à d’autres fins que l’ouverture de vos groupes d’onglets.

## Suppression

Vous pouvez supprimer vos modèles à tout moment depuis les paramètres de l’extension. La
désinstallation de TabSkald supprime les données enregistrées par l’extension sur l’appareil.

## Contact

Pour toute question, ouvrez une issue sur
[github.com/VEBERArnaud/TabSkald](https://github.com/VEBERArnaud/TabSkald/issues).

---

# TabSkald privacy policy

_Last updated: November 8, 2026_

TabSkald is a Chrome extension that opens user-defined tab groups when Chrome starts.

- **Data handled**: only the configuration you create (group names, colors, URLs and the
  auto-launch setting). URLs of open tabs are read locally to recognize an already open group or to
  import one; they are neither stored nor transmitted.
- **Storage**: the configuration is stored with `chrome.storage.sync`. If Chrome sync is enabled,
  Chrome syncs it across your devices with your Google account, under Google’s privacy policy.
- **No collection**: no data is sent to the developer or any third party. No network requests,
  analytics, tracking or ads. No access to page content. No data is sold or used for any other
  purpose.
- **Deletion**: delete templates from the extension settings at any time; uninstalling the
  extension removes its data from the device.
- **Contact**: open an issue on
  [github.com/VEBERArnaud/TabSkald](https://github.com/VEBERArnaud/TabSkald/issues).
