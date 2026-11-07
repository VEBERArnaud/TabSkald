# Sécurité

## Signaler une vulnérabilité

Ne signalez pas une vulnérabilité dans une issue publique. Utilisez le signalement privé de GitHub :
onglet **Security**, puis **Report a vulnerability**
([lien direct](https://github.com/VEBERArnaud/TabSkald/security/advisories/new)).

Indiquez la version de TabSkald et de Chrome, les étapes pour reproduire le problème et son impact.
Vous recevrez une réponse dès que possible.

## Versions prises en charge

Seule la dernière version publiée reçoit des correctifs de sécurité.

## Périmètre

TabSkald ne demande que les permissions `storage`, `tabGroups` et `tabs`, sans accès aux sites ni
code distant. Sont notamment dans le périmètre : une fuite des URL configurées, l’ouverture d’URL
non `http`/`https`, ou un message accepté depuis une source autre que l’extension elle-même.
