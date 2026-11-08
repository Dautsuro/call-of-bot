import {
  ActionRowBuilder, Client, EmbedBuilder, Events, GatewayIntentBits, SlashCommandBuilder, StringSelectMenuBuilder,
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
    .addStringOption((o) => o.setName('categorie').setDescription('Une seule catégorie, avec le choix de la classe à afficher')
      .addChoices(...choices(CATEGORIES)))
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

async function tierlist(interaction, mode, category) {
  const weapons = rankWeapons(await fetchStore(), mode);
  const line = (w) => `${w.rank}. **${w.name}** · ${w.tier}`;
  const embed = new EmbedBuilder().setColor(TIER_COLORS.META).setURL('https://wzstats.gg/mw4/meta')
    .setFooter({ text: `${MODES[mode]} · wzstats.gg` });

  if (!category) {
    embed.setTitle('Tier list MW4');
    for (const [type, label] of Object.entries(CATEGORIES)) {
      const list = weapons.filter((w) => w.type === type);
      if (list.length) embed.addFields({ name: label, value: list.map(line).join('\n'), inline: true });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  const list = weapons.filter((w) => w.type === category);
  if (!list.length) return interaction.editReply(`Aucune arme dans la catégorie ${CATEGORIES[category]}.`);
  embed.setTitle(`Tier list · ${CATEGORIES[category]}`).setDescription(list.map(line).join('\n'));
  const menu = new StringSelectMenuBuilder().setCustomId(`class:${mode}`).setPlaceholder('Voir la classe de…')
    .addOptions(list.slice(0, 25).map((w) => ({ label: `${w.rank}. ${w.name}`, description: `Tier ${w.tier}`, value: w.id })));
  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
}

async function pickClass(interaction) {
  const mode = interaction.customId.split(':')[1];
  const weapon = rankWeapons(await fetchStore(), mode).find((w) => w.id === interaction.values[0]);
  if (!weapon) return interaction.editReply('Cette arme n’est plus dans la tier list.');
  await interaction.editReply({ embeds: [await classEmbed(weapon, mode)] });
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
  console.log(`Connecté en tant que ${c.user.tag}, commandes /meta et /tierlist enregistrées.`);

  if (!process.env.ALERT_CHANNEL_ID) return console.log('ALERT_CHANNEL_ID absent : pas de suivi de la tier list.');
  const check = () => checkTierList(c).catch((err) => console.error('Suivi tier list :', err));
  await check();
  setInterval(check, 30 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  const isCommand = interaction.isChatInputCommand();
  const isPick = interaction.isStringSelectMenu() && interaction.customId.startsWith('class:');
  if (!isCommand && !isPick) return;
  try {
    await interaction.deferReply();
    if (isPick) return await pickClass(interaction);
    const mode = interaction.options.getString('mode') ?? 'mw4';
    if (interaction.commandName === 'meta') await meta(interaction, mode);
    else await tierlist(interaction, mode, interaction.options.getString('categorie'));
  } catch (err) {
    console.error(err);
    const msg = `Erreur : ${err.message}`;
    await (interaction.deferred ? interaction.editReply({ content: msg, embeds: [], components: [] }) : interaction.reply(msg)).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
