# Contribuer à TabSkald

Merci de votre intérêt ! Les issues et les pull requests sont les bienvenues.

## Avant de commencer

- Pour un bug, ouvrez une issue avec les étapes pour le reproduire.
- Pour une nouvelle fonctionnalité, ouvrez d’abord une issue pour en discuter : TabSkald reste
  volontairement simple (pas de compte, pas de réseau, pas de gestion de sessions).
- Pour une vulnérabilité, suivez [SECURITY.md](SECURITY.md) plutôt qu’une issue publique.

## Environnement

Prérequis : Node.js 22 ou plus et pnpm 10.

```sh
pnpm install
pnpm dev     # compilation continue dans dist/
```

Chargez ensuite `dist/` dans `chrome://extensions` (mode développeur, « Charger l’extension non
empaquetée »). Le [README](README.md) explique comment inspecter le service worker et contient la
checklist de validation manuelle. L’architecture est décrite dans
[docs/architecture.md](docs/architecture.md).

## Conventions

- TypeScript strict. L’interface et la documentation sont en français ; le code, les commentaires et
  les messages de commit sont en anglais.
- Toute modification de comportement s’accompagne de tests (`test/`, navigateur simulé).
- Avant d’ouvrir une PR :

  ```sh
  pnpm typecheck && pnpm lint && pnpm test && pnpm build
  ```

  La CI exécute les mêmes commandes.

## Pull requests

- Les PR sont fusionnées en **squash** : leur **titre** devient le message de commit sur `main`.
- Ce titre suit les [Conventional Commits](https://www.conventionalcommits.org/) :
  `type(scope): sujet`, avec `feat`, `fix`, `docs`, `refactor`, `perf`, `test` ou `chore`.
- release-please s’appuie sur ces titres pour calculer la version et le changelog : un `feat`
  produit une nouvelle version mineure, un `fix` une version corrective.
- Gardez une PR centrée sur un seul sujet.

## Licence

En contribuant, vous acceptez que votre contribution soit distribuée sous la
[licence MIT](LICENSE) du projet.
