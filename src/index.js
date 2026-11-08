import {
  ActionRowBuilder, Client, EmbedBuilder, Events, GatewayIntentBits, SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import { attachments, CATEGORIES, fetchBuilds, fetchStore, MODES, rankWeapons } from './wzstats.js';

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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  await c.application.commands.set(commands.map((cmd) => cmd.toJSON()));
  console.log(`Connecté en tant que ${c.user.tag}, commandes /meta et /tierlist enregistrées.`);
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
