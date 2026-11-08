import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, SlashCommandBuilder,
} from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import {
  attachments, CATEGORIES, diffSnapshots, fetchBuilds, fetchStore, MODES, rankWeapons, snapshot,
} from './wzstats.js';

const SLOT_LABELS = {
  apex: 'Apex', optic: 'Optique', muzzle: 'Bouche', barrel: 'Canon', underbarrel: 'Sous le canon', magazine: 'Chargeur',
  rearGrip: 'Poignée arrière', stock: 'Crosse', laser: 'Laser', ammunition: 'Munitions', fireMods: 'Mod de tir',
};
const TIER_COLORS = { META: 0xff3b5c, A: 0xff9f1a, B: 0xffd23f, C: 0x3ec46d, D: 0x5b8def };
const choices = (obj) => Object.entries(obj).map(([value, name]) => ({ name, value }));

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

async function classEmbed(weapon, mode) {
  const [build] = await fetchBuilds(weapon.id, mode);
  const lines = build ? attachments(build).map((a) => `**${SLOT_LABELS[a.slot] ?? a.slot}** · ${a.name}`) : ['Aucune classe publiée.'];
  return new EmbedBuilder()
    .setColor(TIER_COLORS[weapon.tier] ?? 0x888888)
    .setTitle(`${weapon.name} — ${weapon.tier === 'META' ? 'META' : `Tier ${weapon.tier}`}`)
    .setURL('https://wzstats.gg/mw4/meta')
    .setDescription([`#${weapon.rank} ${CATEGORIES[weapon.type] ?? weapon.type} · ${MODES[mode]}`,
      build?.playstyle ? `*${build.playstyle.replace(/_/g, ' ')}*` : '', '', ...lines].join('\n'))
    .setImage(weapon.image);
}

// Discord allows 10 embeds per message.
async function sendEmbeds(interaction, embeds) {
  await interaction.editReply({ embeds: embeds.slice(0, 10) });
  for (let i = 10; i < embeds.length; i += 10) await interaction.followUp({ embeds: embeds.slice(i, i + 10) });
}

async function meta(interaction, mode) {
  const weapons = rankWeapons(await fetchStore(), mode).filter((w) => w.tier === 'META');
  if (!weapons.length) return interaction.editReply('Aucune arme META trouvée.');
  await sendEmbeds(interaction, await Promise.all(weapons.map((w) => classEmbed(w, mode))));
}

// One message per category: ranked list + one button per weapon that posts its class.
// Discord allows 25 buttons per message (5 rows of 5), so a whole tier list can't fit in one.
function categoryMessage(type, list, mode) {
  const embed = new EmbedBuilder().setColor(TIER_COLORS[list[0].tier] ?? 0x888888)
    .setTitle(`Tier list · ${CATEGORIES[type] ?? type}`).setURL('https://wzstats.gg/mw4/meta')
    .setDescription(list.map((w) => `${w.rank}. **${w.name}** · ${w.tier}`).join('\n'))
    .setFooter({ text: `${MODES[mode]} · wzstats.gg` });
  const buttons = list.slice(0, 25).map((w) => new ButtonBuilder().setCustomId(`class:${mode}:${w.id}`)
    .setLabel(`${w.rank}. ${w.name}`).setStyle(w.tier === 'META' ? ButtonStyle.Danger : ButtonStyle.Secondary));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  return { embeds: [embed], components: rows };
}

async function tierlist(interaction, mode, category) {
  const weapons = rankWeapons(await fetchStore(), mode);
  const types = category ? [category] : [...new Set([...Object.keys(CATEGORIES), ...weapons.map((w) => w.type)])];
  const messages = types.map((type) => weapons.filter((w) => w.type === type)).filter((list) => list.length)
    .map((list) => categoryMessage(list[0].type, list, mode));
  if (!messages.length) return interaction.editReply(`Aucune arme dans la catégorie ${CATEGORIES[category] ?? category}.`);
  await interaction.editReply(messages[0]);
  for (const m of messages.slice(1)) await interaction.followUp(m);
}

// Shared by the weapon buttons and /classe: `query` is a weapon id or name.
async function showClass(interaction, mode, query) {
  const q = query.trim().toLowerCase();
  const weapons = rankWeapons(await fetchStore(), mode);
  const weapon = weapons.find((w) => w.id === query || w.name.toLowerCase() === q) ?? (q ? weapons.find((w) => w.name.toLowerCase().includes(q)) : undefined);
  if (!weapon) return interaction.editReply(`Arme introuvable dans la tier list ${MODES[mode]} : ${query}`);
  await interaction.editReply({ embeds: [await classEmbed(weapon, mode)] });
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
  const isCommand = interaction.isChatInputCommand();
  const isButton = interaction.isButton() && interaction.customId.startsWith('class:');
  if (!isCommand && !isButton) return;
  try {
    await interaction.deferReply();
    if (isButton) {
      const [, mode, weaponId] = interaction.customId.split(':');
      return await showClass(interaction, mode, weaponId);
    }
    const mode = interaction.options.getString('mode') ?? 'mw4';
    if (interaction.commandName === 'meta') await meta(interaction, mode);
    else if (interaction.commandName === 'classe') await showClass(interaction, mode, interaction.options.getString('arme'));
    else await tierlist(interaction, mode, interaction.options.getString('categorie'));
  } catch (err) {
    console.error(err);
    const msg = `Erreur : ${err.message}`;
    await (interaction.deferred ? interaction.editReply({ content: msg, embeds: [], components: [] }) : interaction.reply(msg)).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
