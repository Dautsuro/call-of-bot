# call-of-bot

Bot Discord qui récupère les classes méta de Modern Warfare 4 sur [wzstats.gg/mw4/meta](https://wzstats.gg/mw4/meta) et les poste dans le salon quand on le demande.

## Commandes

| Commande | Ce que ça fait |
|---|---|
| `/meta` | Poste la carte de classe (image de l'arme + accessoires) de chaque arme du tier META. |
| `/tierlist` | Image de la tier list complète (META → D, avec toutes les armes). |
| `/tierlist categorie:Sniper` | Image du classement d'une catégorie (1, 2, 3…). |
| `/classe arme:M4` | La carte de classe d'une arme directement (le nom se complète tout seul en tapant). |

Sous la tier list : des boutons de catégorie (AR, SMG, Sniper… et « Tout ») qui changent l'image **dans le même message**, pour tout le monde dans le salon, et un menu « Voir la classe d'une arme… » qui poste la carte de classe.

Option `mode` sur toutes les commandes : Multijoueur (par défaut), Résurgence, DMZ PvP, DMZ PvE.

Les données du site sont gardées 5 minutes en mémoire, donc une modif sur wzstats.gg peut mettre jusqu'à 5 minutes à apparaître.

## Suivi automatique de la tier list

Si `ALERT_CHANNEL_ID` est rempli dans `.env`, le bot vérifie la tier list toutes les 30 minutes (les 4 modes) et poste dans ce salon ce qui a changé depuis le contrôle précédent : armes qui montent ⬆️ ou descendent ⬇️ (tier et rang dans leur catégorie), nouvelles armes 🆕, armes retirées ❌.

Pour trouver l'ID d'un salon : Paramètres Discord → Avancés → activer le *Mode développeur*, puis clic droit sur le salon → *Copier l'identifiant du salon*. Le bot doit pouvoir voir ce salon et y envoyer des messages.

Le dernier état connu est gardé dans `last-tierlist.json`, donc rien n'est perdu si le bot redémarre. Au tout premier lancement, il enregistre juste l'état actuel sans rien poster.

## Installation

1. Installer [Node.js](https://nodejs.org) 20.6 ou plus récent.
2. Sur le [portail développeur Discord](https://discord.com/developers/applications) : *New Application* → onglet **Bot** → *Reset Token* et copier le token.
3. Onglet **OAuth2 → URL Generator** : cocher `bot` et `applications.commands`, puis les permissions *Send Messages* et *Embed Links*. Ouvrir l'URL générée pour inviter le bot sur le serveur.
4. Dans ce dossier :
   ```bash
   npm install
   cp .env.example .env   # puis coller le token (et l'ID du salon, optionnel) dans .env
   npm start
   ```

Le bot doit rester lancé pour répondre. Au premier démarrage, les commandes slash peuvent mettre quelques minutes à apparaître.

Les données viennent directement de wzstats.gg à chaque commande : si le site change sa structure, le bot affichera une erreur au lieu de mauvaises infos.
