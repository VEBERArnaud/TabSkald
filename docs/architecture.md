# Architecture de TabSkald

## Vue d’ensemble

```
src/
  shared/          Code commun aux interfaces et au service worker, sans API Chrome
    model.ts         Types (Config, GroupTemplate…), couleurs, résultats d’opération
    validation.ts    Validation des URL, lecture structurelle et règles métier de la configuration
    messages.ts      Messages typés UI → service worker, validation à l’exécution
    importDraft.ts   Conversion d’un groupe ouvert en modèle (import)
    syncLayout.ts    Découpage de la configuration en clés storage.sync, quotas
    configFile.ts    Export et import de la configuration en JSON
  background/      Service worker
    index.ts         Listeners au niveau supérieur, branchement des dépendances réelles
    chromeApi.ts     Adaptateur minimal des API Chrome (interface ChromeApi + implémentation)
    storage.ts       Configuration (storage.sync) et état d’exécution (storage.session)
    matching.ts      Normalisation d’URL, reconnaissance des groupes déjà ouverts
    orchestrator.ts  File sérialisée, démarrage, ouverture des groupes
    handlers.ts      Traitement des messages
  popup/, options/ Interfaces React
  ui/              Éléments partagés par les interfaces (client de messages, styles)
test/              Navigateur simulé (fakeChrome.ts) et tests Vitest
```

La logique métier ne dépend que de `ChromeApi` et de `KeyValueStore`, deux interfaces volontairement
petites. Les tests injectent `FakeBrowser` et `MemoryStore` à leur place.

## Flux

### Démarrage

```
runtime.onStartup ─► startup = pending ─► runStartup
                                            │
                                            ├─ config invalide / désactivée / vide ─► lastResult, startup = done
                                            ├─ aucune fenêtre adaptée ──────────────► startup = waitingForWindow
                                            └─ fenêtre choisie ─► startup = running ─► openTemplates ─► lastResult, startup = done

windows.onCreated ─► si startup = waitingForWindow ─► runStartup
réveil du worker   ─► si startup ∈ {pending, waitingForWindow, running} ─► runStartup (reprise)
```

`storage.session` est vidé au redémarrage de Chrome et au rechargement de l’extension. Lors d’une
installation, d’une mise à jour ou d’un rechargement, l’état de démarrage est donc absent et rien ne
s’ouvre. Un simple réveil du worker trouve `done` et ne fait rien non plus.

### Ouverture d’un modèle (`openTemplate`)

1. **Suivi de session** : si un groupe créé ou reconnu pendant la session existe encore dans la
   fenêtre (ou dans n’importe quelle fenêtre, au démarrage), rien n’est recréé. Une mise en forme
   restée en échec est réappliquée à cette occasion.
2. **Reconnaissance** par signature exacte (nom, couleur, URL normalisées dans l’ordre). Voir le
   tableau du README.
3. **Création** :
   - onglets inactifs ajoutés en fin de fenêtre, sans attendre leur chargement ;
   - `tabs.group`, puis enregistrement immédiat du suivi ;
   - `tabGroups.update` pour le nom, la couleur et l’état replié.

Les identifiants des groupes vivants sont relus dans Chrome (`tabGroups.get`) avant chaque opération.
Les entrées dont le groupe a disparu sont retirées.

### Messages

Les interfaces envoient des messages `Request` (union discriminée). Le service worker les valide
avec `parseRequest` et répond par `{ ok: true, data }` ou `{ ok: false, error, issues? }`.
L’opération s’exécute dans le service worker : si la popup se ferme, seule la réponse est perdue.
Le résultat reste consultable via `lastResult`.

La popup résout explicitement sa fenêtre avec `chrome.windows.getCurrent()`, qui désigne celle qui
l’héberge, et transmet son identifiant.

### Configuration synchronisée

```
saveConfig ─► normalisation, validation (règles métier et quotas de storage.sync)
           ─► sync.set({ settings, group:<id>… })   une seule écriture
           ─► sync.remove(group:<id> supprimés)
           ─► local.remove(config)                  ancienne configuration non synchronisée

loadConfig ─► settings + group:<id> de storage.sync, dans l’ordre de settings.groupIds
           ─► sinon config de storage.local (version antérieure, pas encore migrée)
           ─► sinon configuration vide, sans rien écrire

runtime.onInstalled ─► migrateLegacyConfig : storage.local ─► storage.sync si sync est vide
```

Une clé par groupe garde chaque élément sous la limite de 8 Ko par clé. Les quotas sont vérifiés
avec les règles métier, ce qui permet d’afficher l’erreur à côté du groupe trop volumineux. Une
écriture refusée par Chrome (fréquence ou taille) est renvoyée comme une erreur d’enregistrement.

Les interfaces écoutent `storage.onChanged` pour toutes les zones : une modification arrivée d’un
autre ordinateur rafraîchit la popup et la page de paramètres.

## Choix et compromis

- **File en mémoire plutôt que verrou** : `chrome.storage` n’offre pas de transaction. Une file de
  promesses sérialise les opérations dans l’instance du worker, et Chrome n’exécute qu’une instance
  à la fois. Après un redémarrage du worker, la relecture de l’état réel de Chrome prend le relais.
  Ce n’est pas une garantie « exactement une fois ».
- **Reconnaissance prudente** : le nom seul ne suffit jamais. En cas de doute au démarrage, on
  préfère signaler un conflit plutôt que créer un doublon ou modifier un groupe. En manuel, la
  demande explicite de l’utilisateur l’emporte sur une simple homonymie.
- **Retour arrière limité** : en cas d’échec de `tabs.group`, seuls les onglets créés à l’instant
  par l’opération sont refermés, pour ne pas laisser d’onglets orphelins qu’une relance dupliquerait.
- **Interrupteur global enregistré immédiatement** : il est partagé par la popup et la page de
  paramètres. `saveGroups` n’écrase pas sa valeur, ce qui évite qu’une page restée ouverte annule un
  changement fait dans la popup.
- **Avertissement pour les URL en double dans un modèle** : signalées mais non bloquantes, car
  ouvrir deux fois la même page peut être voulu.
- **Modèles importés non ouverts au démarrage par défaut** : l’utilisateur l’active explicitement.
- **Synchronisation sans fusion** : le dernier enregistrement l’emporte. Une fusion par groupe
  demanderait un historique des modifications, disproportionné pour une configuration modifiée
  rarement.
- **Import JSON vers l’éditeur** : le fichier remplace les modèles du brouillon, sans enregistrer.
  L’utilisateur peut encore annuler, comme pour l’import d’un groupe ouvert.
- **Pas de rechargement à chaud** : `pnpm dev` recompile en continu. Le rechargement de l’extension
  reste manuel, ce qui évite un outillage spécifique.

## Build

Vite construit trois points d’entrée :

- `background/index.ts` → `dist/background.js`, nom fixe référencé par le manifest, chargé comme
  module ES ;
- `popup/index.html` ;
- `options/index.html`.

Les morceaux partagés sont placés dans `dist/assets`. `public/` (manifest, icônes) est copié tel
quel. La cible est `chrome102`, alignée sur `minimum_chrome_version`.

`pnpm package` produit `tabskald.zip`, avec `manifest.json` à la racine, comme l’attend le Chrome
Web Store. Le workflow `release.yml` le joint à chaque release créée par release-please.
