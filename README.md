# call-of-bot

Bot Discord qui récupère les classes méta de Modern Warfare 4 sur [wzstats.gg/mw4/meta](https://wzstats.gg/mw4/meta) et les poste dans le salon quand on le demande.

## Commandes

| Commande | Ce que ça fait |
|---|---|
| `/meta` | Poste toutes les armes du tier META, chacune avec l'image de l'arme et sa classe (accessoires). |
| `/tierlist` | Tier list complète, rangée par catégorie (fusil d'assaut, mitraillette, sniper, pistolet…). |
| `/tierlist categorie:Pistolet` | Classement d'une seule catégorie + un menu pour choisir une arme et afficher sa classe. |

Option `mode` sur les deux commandes : Multijoueur (par défaut), Résurgence, DMZ PvP, DMZ PvE.

## Installation

1. Installer [Node.js](https://nodejs.org) 20.6 ou plus récent.
2. Sur le [portail développeur Discord](https://discord.com/developers/applications) : *New Application* → onglet **Bot** → *Reset Token* et copier le token.
3. Onglet **OAuth2 → URL Generator** : cocher `bot` et `applications.commands`, puis les permissions *Send Messages* et *Embed Links*. Ouvrir l'URL générée pour inviter le bot sur le serveur.
4. Dans ce dossier :
   ```bash
   npm install
   cp .env.example .env   # puis coller le token dans .env
   npm start
   ```

Le bot doit rester lancé pour répondre. Au premier démarrage, les commandes slash peuvent mettre quelques minutes à apparaître.

Les données viennent directement de wzstats.gg à chaque commande : si le site change sa structure, le bot affichera une erreur au lieu de mauvaises infos.
