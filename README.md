# TabSkald

> Tes projets, ouverts et organisés.

Ouvrez automatiquement vos groupes d’onglets au démarrage de Chrome.

TabSkald est une extension Chrome (Manifest V3) qui ouvre, à chaque démarrage de votre profil
Chrome, des **groupes d’onglets prédéfinis** : nom, couleur, état replié ou déplié, URL dans un
ordre donné. Elle fonctionne **en complément** des pages de démarrage natives de Chrome (par exemple
GitHub et Feedly), sans modifier les paramètres de Chrome.

Les groupes sont des **modèles** indépendants de votre navigation. Ouvrir, fermer ou faire naviguer
des onglets pendant la journée ne modifie pas la configuration. TabSkald n’est ni un gestionnaire de
sessions ni un remplacement de la page Nouvel onglet.

## Fonctionnalités

- **Page de paramètres** :
  - créer, modifier, supprimer et réordonner des modèles de groupe ;
  - pour chaque modèle : nom, couleur Chrome, replié ou déplié, ouverture au démarrage oui ou non ;
  - ajouter, modifier, supprimer et réordonner les URL, ou en coller plusieurs (une par ligne) ;
  - activer ou désactiver globalement l’ouverture automatique ;
  - enregistrement explicite, avec les erreurs affichées à côté des champs.
- **Popup** :
  - liste des modèles et nombre d’onglets ;
  - ouverture manuelle d’un groupe, même si son ouverture au démarrage est désactivée ;
  - ouverture de tous les groupes de démarrage ;
  - interrupteur global ;
  - résultat de la dernière opération.
- **Import** d’un groupe déjà ouvert (nom, couleur, état replié, URL dans l’ordre). Un aperçu est
  présenté avant l’ajout et les URL non prises en charge sont signalées.
- **Synchronisation** de la configuration entre les ordinateurs connectés au même profil Chrome,
  via `chrome.storage.sync`.
- **Export et import** de la configuration dans un fichier JSON.
- **Ouverture au démarrage** non destructive. TabSkald ne ferme, ne déplace et ne modifie aucun
  onglet ou groupe existant.

## Installation

TabSkald est publié sur le Chrome Web Store (non répertorié, accessible par lien) :
[installer TabSkald](https://chromewebstore.google.com/detail/tabskald/jmlefpakljpebcgohenolbmkmekpbkhf).
Chrome 102 ou plus récent est requis. Les mises à jour sont installées automatiquement.

Si la synchronisation des extensions est active dans Chrome, TabSkald s’installe aussi sur les
autres ordinateurs connectés au même profil, et sa configuration les suit (voir
[Synchronisation entre ordinateurs](#synchronisation-entre-ordinateurs)).

### Depuis les sources

Pour développer ou tester une modification. Prérequis : Node.js 22 ou plus et pnpm 10.

```sh
pnpm install
pnpm build
```

Puis, dans Chrome :

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode développeur** (en haut à droite).
3. Cliquer sur **Charger l’extension non empaquetée** et sélectionner le dossier `dist` du projet.
4. Épingler TabSkald dans la barre d’outils (icône puzzle) pour accéder facilement à la popup.

Après une nouvelle compilation, cliquer sur l’icône de rechargement de TabSkald dans
`chrome://extensions`. La configuration est conservée lors d’un rechargement.

La version chargée depuis les sources a un autre identifiant que celle du Store : sa configuration
est distincte. Pour passer de l’une à l’autre, utilisez l’export et l’import JSON, et n’en gardez
qu’une active pour éviter que les groupes s’ouvrent deux fois au démarrage.

## Développement

| Commande         | Rôle                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `pnpm dev`       | Compilation continue de `dist` (mode développement, avec sourcemaps) |
| `pnpm build`     | Compilation de production dans `dist`                                |
| `pnpm package`   | Compilation de production puis archive `tabskald.zip` pour le Store  |
| `pnpm typecheck` | Vérification TypeScript (strict)                                     |
| `pnpm lint`      | ESLint puis vérification Prettier                                    |
| `pnpm format`    | Formatage Prettier                                                   |
| `pnpm test`      | Tests Vitest                                                         |

`pnpm dev` ne fait pas de rechargement à chaud : après chaque recompilation, rechargez l’extension
dans `chrome://extensions` et rouvrez la popup ou la page de paramètres.

### Inspecter le service worker

1. Dans `chrome://extensions`, sur la carte de TabSkald, cliquer sur le lien **service worker**
   (« Inspecter les vues »). Les DevTools du service worker s’ouvrent.
2. Dans la console, on peut consulter l’état :

   ```js
   await chrome.storage.sync.get(null); // configuration synchronisée : settings, group:<id>
   await chrome.storage.session.get(null); // état temporaire : startup, managedGroups, lastResult
   ```

3. Les erreurs inattendues sont journalisées avec le préfixe `[TabSkald]`, sans les URL configurées.

Le service worker s’arrête après environ 30 secondes d’inactivité. C’est normal : il est relancé
par le prochain événement (message de la popup, création de fenêtre, démarrage).

## Utilisation

1. Ouvrir les paramètres (bouton **Paramètres** de la popup, ou clic droit sur l’icône puis
   **Options**).
2. Créer un groupe : nom, couleur, état replié ou déplié, ouverture au démarrage, puis les URL.
   Seules les URL absolues `http` et `https` sont acceptées, `localhost` et les ports compris.
3. Cliquer sur **Enregistrer**.
4. Tester depuis la popup avec **Ouvrir**. Le groupe est ajouté à la fin de la fenêtre où la
   popup a été ouverte, sans prendre le focus.
5. Au prochain vrai démarrage de Chrome, les groupes activés sont ajoutés automatiquement.

Pour **importer** un groupe déjà ouvert, utilisez la section « Importer un groupe ouvert » des
paramètres : **Lister les groupes ouverts**, **Prévisualiser**, **Ajouter ce modèle**, puis
**Enregistrer**. Un modèle importé n’est pas ouvert au démarrage tant que vous ne l’activez pas.

La section « Exporter ou importer la configuration » des paramètres sert aux sauvegardes et au
passage d’une installation à une autre, par exemple de la version chargée en mode développeur à
celle du Chrome Web Store :

- **Exporter** télécharge la configuration enregistrée (`tabskald-AAAA-MM-JJ.json`) ;
- **Importer un fichier…** affiche les modèles du fichier, puis **Remplacer les modèles** les place
  dans l’éditeur à la place des modèles actuels. Rien n’est enregistré avant **Enregistrer**, et
  l’interrupteur d’ouverture automatique n’est pas modifié.

## Comportement au démarrage

- Le déclencheur est `chrome.runtime.onStartup`, émis quand le **profil** Chrome démarre.
- Ne déclenchent **pas** d’ouverture : l’ouverture d’une nouvelle fenêtre, le réveil du service
  worker, l’installation, la mise à jour ou le rechargement de l’extension.
- Les groupes sont ajoutés dans **une seule fenêtre** : la fenêtre normale non privée qui a le
  focus, sinon celle qui a le plus petit identifiant. Ils viennent après les onglets déjà présents.
  L’onglet Nouvel onglet et vos pages de démarrage restent en place.
- Si aucune fenêtre adaptée n’existe encore, par exemple sur macOS quand Chrome démarre sans
  fenêtre, la demande reste en attente. Elle est traitée à l’apparition de la première fenêtre
  normale, puis plus jamais pendant la session.
- Les onglets sont créés sans attendre le chargement des pages : un site lent ou injoignable ne
  bloque rien.
- Le résultat (succès, succès partiel, erreur, conflit) est visible dans la popup.

### Fermer une fenêtre ou quitter Chrome

`onStartup` n’est émis qu’au **démarrage du profil**, pas à l’ouverture d’une fenêtre.

- **macOS** : fermer la dernière fenêtre (bouton rouge ou `⌘W`) **ne quitte pas** Chrome, qui
  reste actif dans le Dock. Rouvrir une fenêtre n’est pas un démarrage et TabSkald n’ouvre rien.
  Pour un vrai redémarrage, quittez Chrome avec `⌘Q` (ou **Chrome > Quitter Google Chrome**).
- **Windows et Linux** : fermer la dernière fenêtre quitte généralement Chrome. Si l’option
  « Continuer à exécuter les applications en arrière-plan après la fermeture de Google Chrome »
  est activée, Chrome peut rester actif et le démarrage suivant n’en est pas un.
- Un profil Chrome supplémentaire a sa propre configuration TabSkald et son propre démarrage.

## Synchronisation entre ordinateurs

La configuration (modèles et interrupteur d’ouverture automatique) est enregistrée dans
`chrome.storage.sync`. Chrome la synchronise entre les ordinateurs connectés au même compte Google,
pour la même extension. Chaque ordinateur ouvre ensuite les groupes à son propre démarrage.
L’état d’exécution (groupes suivis, dernier résultat) reste propre à chaque ordinateur.

Conditions :

- la synchronisation Chrome doit être active pour ce profil (`chrome://settings/syncSetup`) ;
- l’extension doit avoir **le même identifiant** sur chaque ordinateur : c’est le cas d’une
  installation depuis le Chrome Web Store. Une extension chargée en mode développeur a un
  identifiant qui dépend de son dossier : utilisez alors l’export et l’import JSON. L’identifiant
  de la version du Store est `jmlefpakljpebcgohenolbmkmekpbkhf`.

Comportement :

- une modification enregistrée sur un ordinateur apparaît sur les autres après quelques secondes à
  quelques minutes. Les pages de TabSkald ouvertes se mettent à jour, sans écraser des
  modifications non enregistrées ;
- si deux ordinateurs enregistrent presque en même temps, le dernier enregistrement l’emporte ;
- au premier lancement sur un nouvel ordinateur, la configuration peut ne pas être encore arrivée :
  ce démarrage n’ouvre alors rien, les suivants si ;
- une configuration enregistrée par une version antérieure dans `chrome.storage.local` est déplacée
  vers `chrome.storage.sync` à la mise à jour de l’extension, sauf si une configuration
  synchronisée existe déjà : celle-ci l’emporte.

Chrome limite la taille synchronisée : 8 Ko par groupe (environ 40 à 60 onglets selon la longueur
des URL) et 100 Ko au total. Au-delà, l’enregistrement est refusé avec une erreur à côté du groupe
concerné. Chrome limite aussi la fréquence des écritures (120 par minute) ; en cas de refus, il
suffit de réessayer un peu plus tard.

## Doublons et sécurité des onglets

Règles appliquées en permanence :

- TabSkald ne ferme jamais un onglet préexistant, ne remplace aucune URL, ne déplace aucun onglet
  personnel ni aucun onglet d’une autre fenêtre, et ne fusionne ni ne supprime aucun groupe.
- Les ouvertures automatiques et manuelles passent par une file unique dans le service worker. Un
  double clic ou deux événements simultanés sont traités l’un après l’autre, et le second constate
  ce que le premier a créé.
- Pendant la session, TabSkald garde trace des groupes qu’il a créés (`chrome.storage.session`).
  - Si le groupe existe toujours, une nouvelle demande ne le recrée pas.
  - Si vous l’avez fermé, une demande manuelle le rouvre.
  - Fermer un onglet ne provoque jamais sa réouverture.
- Une même URL peut figurer dans plusieurs modèles : il n’y a pas de déduplication globale par URL.

### Reconnaissance des groupes déjà ouverts

Les identifiants de groupes Chrome changent d’une session à l’autre. Chaque modèle a donc son propre
identifiant stable. Après un redémarrage ou un rechargement de l’extension, un groupe ouvert est
reconnu **uniquement si** son nom, sa couleur et la liste ordonnée de ses URL normalisées
correspondent exactement au modèle. Pour les onglets encore en chargement, c’est `pendingUrl` qui est
comparée.

| Situation                                          | Au démarrage                     | Ouverture manuelle               |
| -------------------------------------------------- | -------------------------------- | -------------------------------- |
| Un seul groupe identique                           | reconnu, rien n’est créé         | reconnu, rien n’est créé         |
| Plusieurs groupes identiques                       | conflit signalé, rien n’est créé | conflit signalé, rien n’est créé |
| Même nom, contenu différent (couleur, URL, ordre…) | conflit signalé, rien n’est créé | création, avec un avertissement  |
| Aucun groupe de ce nom                             | création                         | création                         |

Les groupes existants ne sont jamais modifiés. La reconnaissance au démarrage porte sur toutes les
fenêtres normales, la reconnaissance manuelle sur la seule fenêtre ciblée.

**Limites** :

- Si Chrome restaure une session dans laquelle vous aviez modifié un groupe (onglet ajouté, page
  suivie, redirection de connexion…), le groupe n’est plus identique. TabSkald le conserve, signale
  un conflit et ne crée pas de doublon au démarrage. Vous pouvez ensuite l’ouvrir manuellement.
- Un site qui redirige dès le chargement (par exemple vers une page de connexion) change l’URL
  observée. Après un redémarrage avec restauration de session, le groupe sera donc vu comme
  différent et signalé en conflit.
- La coexistence avec l’option Chrome « Reprendre là où vous vous étiez arrêté » est non
  destructive, mais elle n’est **pas** garantie sans conflit dans tous les cas. Le fonctionnement
  nominal reste « Ouvrir une page ou un ensemble de pages spécifiques » ou « Ouvrir la page Nouvel
  onglet ».

### Interruption et erreurs partielles

- La configuration est dans `chrome.storage.sync`. L’état d’exécution (étape du démarrage,
  groupes suivis, dernier résultat) est dans `chrome.storage.session`, vidé à chaque redémarrage de
  Chrome et à chaque rechargement de l’extension.
- Si le service worker est interrompu pendant un démarrage, la reprise a lieu à son prochain réveil.
  Elle relit d’abord l’état réel de Chrome : ce qui existe déjà est reconnu, pas recréé.
- La suite lecture-écriture dans `chrome.storage` **n’est pas un verrou transactionnel**.
  TabSkald n’offre pas de garantie « exactement une fois ». La file et la reconnaissance rendent les
  doublons improbables, pas impossibles. C’est le cas par exemple si le service worker est arrêté
  entre la création des onglets et leur regroupement.
- Une erreur sur un groupe n’empêche pas le traitement des suivants :
  - un onglet qui ne peut pas être créé donne un groupe **partiel** ;
  - si le regroupement échoue, les onglets que TabSkald venait de créer sont refermés, et eux seuls ;
  - si l’application du nom, de la couleur ou de l’état replié échoue, une nouvelle demande la
    réapplique sans recréer le groupe.

## Permissions

| Permission  | Justification                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `storage`   | Configuration synchronisée (`storage.sync`) et état temporaire d’exécution (`storage.session`).  |
| `tabGroups` | Lire les groupes ouverts (reconnaissance, import) et leur appliquer nom, couleur et état replié. |
| `tabs`      | Lire `url` et `pendingUrl` des onglets ouverts, nécessaires à l’import et à la reconnaissance.   |

Créer et regrouper des onglets avec `chrome.tabs` ne demande pas de permission particulière. La
permission `tabs` sert uniquement à **lire** les URL des onglets existants, que Chrome masque sans
elle.

TabSkald ne demande ni `<all_urls>`, ni `host_permissions`, ni l’historique. Il n’a pas de content
script, n’injecte aucun code dans les pages et ne charge aucun code distant. Il n’y a ni compte, ni
télémétrie, ni requête réseau : aucune URL n’est « vérifiée » en ligne. La synchronisation est
assurée par Chrome lui-même, avec le compte Google du profil.

### Version minimale de Chrome : 102

- `chrome.storage.session` existe depuis Chrome 102 : c’est la contrainte déterminante.
- `chrome.tabGroups` (89, avec promesses depuis 90), `chrome.tabs.group` (88), `pendingUrl` (79) et
  le service worker en module ES (92) sont tous antérieurs.

## Données

Schéma versionné (`schemaVersion: 1`). C’est aussi le format du fichier exporté :

```json
{
  "schemaVersion": 1,
  "autoLaunchEnabled": true,
  "groups": [
    {
      "id": "…",
      "name": "Projet 1",
      "color": "blue",
      "collapsed": true,
      "openOnStartup": true,
      "tabs": [{ "id": "…", "url": "https://github.com/" }]
    }
  ]
}
```

L’ordre des tableaux définit l’ordre des groupes et des onglets.

Dans `chrome.storage.sync`, la configuration est découpée pour respecter la limite de taille par
clé, et écrite en une seule opération :

- `settings` : `{ schemaVersion, autoLaunchEnabled, groupIds }`, où `groupIds` donne l’ordre ;
- `group:<id>` : un modèle de groupe.

La configuration est validée à la lecture et à l’enregistrement :

- une configuration illisible n’est **jamais effacée**. La page de paramètres l’affiche brute et
  explique le problème ; la réinitialisation demande une confirmation explicite ;
- les URL sont seulement débarrassées de leurs espaces extérieurs. Paramètres et fragments sont
  conservés ;
- une URL répétée dans un même modèle donne un avertissement, non bloquant.

## Checklist de validation manuelle

Les tests automatisés utilisent un navigateur simulé. Ils **ne valident pas** le comportement réel
au démarrage de Chrome : cette checklist est indispensable.

1. **Charger TabSkald** depuis `dist`. Attendu : aucune ouverture d’onglet ; la popup affiche
   l’état vide.
2. **Configurer deux groupes**, par exemple « Projet 1 » (5 URL, bleu, replié, démarrage) et
   « Projet 2 » (3 URL, vert, déplié, démarrage), plus « Veille » (démarrage désactivé), puis
   enregistrer. Attendu : message « Configuration enregistrée. ».
3. **Ouvrir depuis la popup** :
   - « Veille » s’ouvre bien qu’il soit exclu du démarrage ;
   - un second clic sur « Ouvrir » ne crée pas de doublon (« déjà ouvert ») ;
   - après la fermeture du groupe, « Ouvrir » le rouvre.
4. **Quitter complètement Chrome** (`⌘Q` sur macOS), puis le relancer.
5. **Vérifier** : GitHub et Feedly (pages de démarrage natives) sont présents, et « Projet 1 » et
   « Projet 2 » sont ajoutés après eux, dans l’ordre, avec leur nom, leur couleur et leur état
   replié. « Veille » n’est pas ouvert. La popup indique « Démarrage ».
6. **Ouvrir une seconde fenêtre** (`⌘N`). Attendu : aucune nouvelle ouverture.
7. **Désactiver l’ouverture automatique** dans la popup, quitter puis relancer Chrome. Attendu :
   aucun groupe ajouté, la popup indique « Ouverture automatique désactivée ». Réactiver ensuite.
8. **Recharger l’extension** dans `chrome://extensions`. Attendu : aucune ouverture, configuration
   intacte.
9. **Restauration de session** : régler Chrome sur « Reprendre là où vous vous étiez arrêté »,
   quitter avec les groupes ouverts, puis relancer. Attendu : aucun onglet ni groupe fermé ou
   déplacé. Les groupes restaurés et inchangés sont reconnus (« déjà présent »). Les groupes
   modifiés sont signalés en conflit, sans doublon. Remettre ensuite le réglage habituel.
10. **Exporter puis importer** la configuration. Attendu : le fichier contient les modèles ; à
    l’import, l’aperçu les liste, puis l’éditeur les affiche en attente d’enregistrement.
11. **Synchronisation** (installation depuis le Chrome Web Store, sur deux ordinateurs) : modifier
    un modèle sur le premier. Attendu : la modification apparaît sur le second, et son prochain
    démarrage en tient compte.

## Limites connues

- Pas de gestion de sessions ni de navigateur autre que Chrome.
- Synchronisation : le dernier enregistrement l’emporte, sans fusion. Un groupe dont la
  synchronisation n’est pas encore arrivée est absent de la configuration ; l’enregistrer à ce
  moment-là depuis un autre ordinateur le supprime.
- La reconnaissance après redémarrage est volontairement prudente : voir « Reconnaissance des
  groupes déjà ouverts ».
- Si le service worker est arrêté entre la création des onglets d’un groupe et leur regroupement
  (très improbable, car les appels en cours le maintiennent actif), des onglets non groupés peuvent
  rester et la reprise recréera le groupe.
- Un groupe ouvert partiellement (un onglet a échoué) n’est pas complété automatiquement par une
  nouvelle demande, puisqu’il existe déjà. Fermez-le puis rouvrez-le pour l’obtenir complet.
- L’ouverture manuelle dans une fenêtre privée est refusée.

## Versions et publication

Les versions sont gérées par [release-please](https://github.com/googleapis/release-please), à
partir des titres de PR au format _conventional commits_ (les PR sont fusionnées en squash) :

1. à chaque fusion sur `main`, release-please ouvre ou met à jour une PR « chore(main): release
   x.y.z » qui met à jour `CHANGELOG.md`, `package.json` et `public/manifest.json` ;
2. fusionner cette PR crée le tag `vx.y.z` et la release GitHub, à laquelle le workflow joint
   `tabskald-vx.y.z.zip` ;
3. ce zip s’envoie tel quel dans le
   [tableau de bord du Chrome Web Store](https://chrome.google.com/webstore/devconsole) (visibilité
   « Non répertoriée »), qui soumet la nouvelle version à une revue.

Avant la version 1.0, un `feat` fait passer à la version mineure suivante et un `fix` à la version
corrective. Le Chrome Web Store exige une version strictement supérieure à la précédente.

## Architecture

Voir [docs/architecture.md](docs/architecture.md).

## Contribuer

Les contributions sont les bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md). Pour signaler une
vulnérabilité, suivez [SECURITY.md](SECURITY.md).

## Confidentialité

TabSkald ne collecte aucune donnée : voir [PRIVACY.md](PRIVACY.md).

## Licence

[MIT](LICENSE) © VEBER Arnaud
