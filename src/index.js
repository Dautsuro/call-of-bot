import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits,
  MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import { renderCategory, renderClassCard, renderTierList, TIER_COLORS } from './render.js';
import {
  CATEGORIES, diffSnapshots, fetchBuilds, fetchStore, MODES, rankWeapons, snapshot,
} from './wzstats.js';

const choices = (obj) => Object.entries(obj).map(([value, name]) => ({ name, value }));
const SHORT = {
  ASSAULT_RIFLE: 'AR', SMG: 'SMG', SHOTGUN: 'Pompe', LMG: 'LMG', MARKSMAN_RIFLE: 'Tactique',
  SNIPER_RIFLE: 'Sniper', PISTOL: 'Pistolet', LAUNCHER: 'Lanceur', MELEE: 'Mêlée',
};

const commands = [
  new SlashCommandBuilder().setName('meta').setDescription('Les classes META du moment (wzstats.gg)')
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu').addChoices(...choices(MODES))),
  new SlashCommandBuilder().setName('tierlist').setDescription('Tier list par catégorie (wzstats.gg)')
    .addStringOption((o) => o.setName('categorie').setDescription('Une seule catégorie').addChoices(...choices(CATEGORIES)))
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu').addChoices(...choices(MODES))),
  new SlashCommandBuilder().setName('classe').setDescription("La classe (accessoires) d'une arme (wzstats.gg)")
    .addStringOption((o) => o.setName('arme').setDescription("Nom de l'arme").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu').addChoices(...choices(MODES))),
];

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const png = (buf, name) => new AttachmentBuilder(buf, { name });

async function classCard(weapon, mode) {
  const [build] = await fetchBuilds(weapon.id, mode);
  return png(await renderClassCard(weapon, build, mode), `classe-${weapon.id}.png`);
}

async function meta(interaction, mode) {
  const weapons = rankWeapons(await fetchStore(), mode).filter((w) => w.tier === 'META');
  if (!weapons.length) return interaction.editReply('Aucune arme META trouvée.');
  const files = await Promise.all(weapons.map((w) => classCard(w, mode)));
  await interaction.editReply({ files: files.slice(0, 10) }); // Discord: max 10 attachments per message
  for (let i = 10; i < files.length; i += 10) await interaction.followUp({ files: files.slice(i, i + 10) });
}

// One message for the whole tier list (type null) or one category; category buttons switch the view in place.
// Rows (max 5): category buttons first (5 per row), then class dropdowns of 25 weapons.
async function tierView(weapons, mode, type) {
  const types = [...new Set([...Object.keys(CATEGORIES), ...weapons.map((w) => w.type)])]
    .filter((t) => weapons.some((w) => w.type === t));
  const shown = type ? weapons.filter((w) => w.type === type) : types.flatMap((t) => weapons.filter((w) => w.type === t));
  const image = type ? await renderCategory(type, shown, mode) : await renderTierList(weapons, mode);
  const buttons = [['ALL', 'Tout'], ...types.map((t) => [t, SHORT[t] ?? CATEGORIES[t] ?? t])]
    .map(([id, label]) => new ButtonBuilder().setCustomId(`view:${mode}:${id}`).setLabel(label)
      .setStyle((type ?? 'ALL') === id ? ButtonStyle.Primary : ButtonStyle.Secondary));
  const rows = chunk(buttons, 5).slice(0, 3).map((b) => new ActionRowBuilder().addComponents(b));
  chunk(shown, 25).slice(0, 5 - rows.length).forEach((list, i) => rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`class:${mode}:menu${i}`).setPlaceholder("🔫 Voir la classe d'une arme…")
      .addOptions(list.map((w) => ({ label: `${w.rank}. ${w.name}`, description: `${CATEGORIES[w.type] ?? w.type} · ${w.tier}`, value: w.id }))))));
  return { content: '', embeds: [], files: [png(image, 'tierlist.png')], components: rows };
}

async function tierlist(interaction, mode, category) {
  const weapons = rankWeapons(await fetchStore(), mode);
  if (category && !weapons.some((w) => w.type === category)) {
    return interaction.editReply(`Aucune arme dans la catégorie ${CATEGORIES[category] ?? category}.`);
  }
  await interaction.editReply(await tierView(weapons, mode, category));
}

// Category button: edits the shared message for everyone; old picture replaced (attachments: []).
async function switchView(interaction) {
  const [, mode, id] = interaction.customId.split(':');
  await interaction.deferUpdate();
  await interaction.editReply({ ...await tierView(rankWeapons(await fetchStore(), mode), mode, id === 'ALL' ? null : id), attachments: [] });
}

// Shared by the dropdowns, legacy weapon buttons and /classe: `query` is a weapon id or name.
async function showClass(interaction, mode, query) {
  const q = query.trim().toLowerCase();
  const weapons = rankWeapons(await fetchStore(), mode);
  const weapon = weapons.find((w) => w.id === query || w.name.toLowerCase() === q) ?? (q ? weapons.find((w) => w.name.toLowerCase().includes(q)) : undefined);
  if (!weapon) return interaction.editReply(`Arme introuvable dans la tier list ${MODES[mode]} : ${query}`);
  await interaction.editReply({ files: [await classCard(weapon, mode)] });
}

async function autocompleteWeapon(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  const weapons = rankWeapons(await fetchStore(), interaction.options.getString('mode') ?? 'mw4');
  await interaction.respond(weapons.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 25)
    .map((w) => ({ name: `${w.name} · ${CATEGORIES[w.type] ?? w.type} · ${w.tier}`, value: w.id })));
}

// Tier list watch: every 30 min, compare with the last saved snapshot and post what moved.
const SNAPSHOT_FILE = new URL('../last-tierlist.json', import.meta.url);
const TIER_ORDER = ['META', 'A', 'B', 'C', 'D'];
const spot = (x) => `${x.tier} #${x.rank}`;

function changeLine({ name, type, before, after }) {
  const label = `**${name}** (${CATEGORIES[type] ?? type})`;
  if (!before) return `🆕 ${label} · ${spot(after)}`;
  if (!after) return `❌ ${label} · retiré (était ${spot(before)})`;
  const up = TIER_ORDER.indexOf(after.tier) - TIER_ORDER.indexOf(before.tier) || after.rank - before.rank;
  return `${up < 0 ? '⬆️' : '⬇️'} ${label} · ${spot(before)} → ${spot(after)}`;
}

async function checkTierList(client) {
  const next = snapshot(await fetchStore());
  const prev = await readFile(SNAPSHOT_FILE, 'utf8').then(JSON.parse, () => null);
  if (prev) {
    const changes = Object.entries(diffSnapshots(prev, next));
    const channel = changes.length && await client.channels.fetch(process.env.ALERT_CHANNEL_ID);
    // One message per mode: Discord caps the total embed text of a message at 6000 chars.
    for (const [mode, list] of changes) {
      let text = list.map(changeLine).join('\n');
      if (text.length > 4000) text = `${text.slice(0, text.lastIndexOf('\n', 3980))}\n…`;
      await channel.send({ embeds: [new EmbedBuilder().setColor(TIER_COLORS.META).setTitle(`Tier list modifiée · ${MODES[mode]}`)
        .setURL('https://wzstats.gg/mw4/meta').setDescription(text).setTimestamp()] });
    }
  } else console.log('Tier list enregistrée, les changements seront postés à partir du prochain contrôle.');
  // Saved only once posted, so a failed post is retried on the next check.
  await writeFile(SNAPSHOT_FILE, JSON.stringify(next));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  await c.application.commands.set(commands.map((cmd) => cmd.toJSON()));
  console.log(`Connecté en tant que ${c.user.tag}, commandes /meta, /tierlist et /classe enregistrées.`);

  if (!process.env.ALERT_CHANNEL_ID) return console.log('ALERT_CHANNEL_ID absent : pas de suivi de la tier list.');
  const check = () => checkTierList(c).catch((err) => console.error('Suivi tier list :', err));
  await check();
  setInterval(check, 30 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) return autocompleteWeapon(interaction).catch((err) => console.error('Autocomplétion :', err));
  if (interaction.isButton() && interaction.customId.startsWith('view:')) {
    // Never overwrite the shared message with an error: tell only the person who clicked.
    return switchView(interaction).catch((err) => {
      console.error(err);
      return interaction.followUp({ content: `Erreur : ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    });
  }
  const isCommand = interaction.isChatInputCommand();
  // Weapon buttons carry the weapon in their id (class:<mode>:<weapon>); dropdowns in their selected value.
  const isPick = (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('class:');
  if (!isCommand && !isPick) return;
  try {
    await interaction.deferReply();
    if (isPick) {
      const [, mode, weaponId] = interaction.customId.split(':');
      return await showClass(interaction, mode, interaction.isStringSelectMenu() ? interaction.values[0] : weaponId);
    }
    const mode = interaction.options.getString('mode') ?? 'mw4';
    if (interaction.commandName === 'meta') await meta(interaction, mode);
    else if (interaction.commandName === 'classe') await showClass(interaction, mode, interaction.options.getString('arme'));
    else await tierlist(interaction, mode, interaction.options.getString('categorie'));
  } catch (err) {
    console.error(err);
    const msg = `Erreur : ${err.message}`;
    await (interaction.deferred ? interaction.editReply({ content: msg, embeds: [], components: [], attachments: [] }) : interaction.reply(msg)).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
