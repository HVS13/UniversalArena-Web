import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const getArg = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const docsRoot = getArg("--docs-root")
  ? path.resolve(process.cwd(), getArg("--docs-root"))
  : process.env.UA_DOCS_ROOT
    ? path.resolve(process.cwd(), process.env.UA_DOCS_ROOT)
    : null;

if (!docsRoot) {
  throw new Error("Missing docs root. Provide --docs-root or UA_DOCS_ROOT.");
}

const dataDir = path.join(docsRoot, "docs", "data");
const charactersDir = path.join(dataDir, "characters");
const assetsDir = path.join(docsRoot, "docs", "assets", "characters");

const outDir = getArg("--out")
  ? path.resolve(process.cwd(), getArg("--out"))
  : path.join(repoRoot, "packages", "data", "src");

const assetsOutDir = getArg("--assets-out")
  ? path.resolve(process.cwd(), getArg("--assets-out"))
  : path.join(repoRoot, "apps", "client", "public", "assets", "characters");

const requiredFields = [
  "id",
  "name",
  "version",
  "origin",
  "roles",
  "difficulty",
  "gameplan",
  "art",
  "cards",
];

const cardFields = ["slot", "name", "cost", "power", "types", "target", "speed", "effect"];
const effectFields = ["type", "timing"];
const effectTypes = new Set([
  "deal_damage",
  "gain_shield",
  "heal",
  "gain_ultimate",
  "gain_status",
  "inflict_status",
  "set_status",
  "gain_status_per_spent",
  "inflict_status_per_spent",
  "spend_status",
  "deal_damage_per_spent",
  "draw_cards",
  "create_card",
  "reload_equipped",
  "switch_equip",
  "reduce_status",
  "grant_keyword",
  "choose",
  "retain",
  "block_play",
]);
const amountKinds = new Set([
  "flat",
  "power",
  "power_div",
  "x",
  "x_plus",
  "x_minus",
  "x_times",
]);
const scalarKinds = new Set(["x", "x_plus", "x_minus", "x_times"]);
const transformFields = ["condition", "cardSlot"];
const transformConditionFields = ["kind"];
const restrictionKinds = new Set(["require", "forbid"]);
const restrictionSubjects = new Set(["self", "target"]);
const restrictionModes = new Set(["any", "all"]);
const effectTargets = new Set(["self", "target", "opponent"]);

const dataFileConfigs = [
  {
    key: "keywords",
    filename: "keywords.yml",
    root: "keywords",
    output: "keywords.json",
    requiredFields: ["id", "name", "category", "description"],
  },
  {
    key: "statusEffects",
    filename: "status-effects.yml",
    root: "statusEffects",
    output: "status-effects.json",
    requiredFields: ["id", "name", "type", "rules"],
  },
  {
    key: "terms",
    filename: "terms.yml",
    root: "terms",
    output: "terms.json",
    requiredFields: ["id", "name", "section", "definition"],
  },
  {
    key: "cardTypes",
    filename: "card-types.yml",
    root: "cardTypes",
    output: "card-types.json",
    requiredFields: ["id", "name", "category", "description"],
  },
  {
    key: "roles",
    filename: "roles.yml",
    root: "roles",
    output: "roles.json",
    requiredFields: ["id", "name", "description"],
  },
];

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateScalar = (value, label, errors) => {
  if (typeof value === "number") return;
  if (!isPlainObject(value)) {
    errors.push(`${label} must be a number or an object.`);
    return;
  }
  const kind = value.kind;
  if (!scalarKinds.has(kind)) {
    errors.push(`${label} has invalid kind "${kind}".`);
    return;
  }
  if (kind !== "x" && typeof value.value !== "number") {
    errors.push(`${label} with kind "${kind}" missing numeric value.`);
  }
};

const validateAmount = (amount, label, errors) => {
  if (!isPlainObject(amount)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  const kind = amount.kind;
  if (!amountKinds.has(kind)) {
    errors.push(`${label} has invalid kind "${kind}".`);
    return;
  }
  if (kind === "flat") {
    if (typeof amount.value !== "number") {
      errors.push(`${label} with kind "flat" missing numeric value.`);
    }
    return;
  }
  if (kind === "power_div") {
    if (!("divisor" in amount)) {
      errors.push(`${label} with kind "power_div" missing divisor.`);
      return;
    }
    validateScalar(amount.divisor, `${label}.divisor`, errors);
    return;
  }
  if (kind === "x_plus" || kind === "x_minus" || kind === "x_times") {
    if (typeof amount.value !== "number") {
      errors.push(`${label} with kind "${kind}" missing numeric value.`);
    }
  }
};

const validateEffectList = (effects, label, filename, errors) => {
  if (!Array.isArray(effects)) {
    errors.push(`${filename}: ${label} effects must be an array.`);
    return;
  }
  effects.forEach((effect, effectIndex) => {
    if (!effect || typeof effect !== "object") {
      errors.push(`${filename}: ${label} effects[${effectIndex}] is not an object.`);
      return;
    }
    effectFields.forEach((field) => {
      if (!(field in effect)) {
        errors.push(`${filename}: ${label} effects[${effectIndex}] missing "${field}".`);
      }
    });
    if (!effect.type || !effectTypes.has(effect.type)) {
      errors.push(
        `${filename}: ${label} effects[${effectIndex}] has invalid type "${effect.type}".`
      );
      return;
    }

    const context = `${filename}: ${label} effects[${effectIndex}]`;
    switch (effect.type) {
      case "deal_damage": {
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.hits !== undefined) {
          validateScalar(effect.hits, `${context}.hits`, errors);
        }
        break;
      }
      case "gain_shield":
      case "heal":
      case "gain_ultimate": {
        validateAmount(effect.amount, `${context}.amount`, errors);
        break;
      }
      case "gain_status":
      case "inflict_status": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        break;
      }
      case "gain_status_per_spent":
      case "inflict_status_per_spent": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        if (typeof effect.resource !== "string" || !effect.resource.trim()) {
          errors.push(`${context} missing resource.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.amount?.kind === "power" || effect.amount?.kind === "power_div") {
          errors.push(`${context} amount cannot use power-based scaling.`);
        }
        break;
      }
      case "set_status": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.target !== undefined && !effectTargets.has(effect.target)) {
          errors.push(`${context} has invalid target "${effect.target}".`);
        }
        break;
      }
      case "spend_status": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.amount?.kind === "power" || effect.amount?.kind === "power_div") {
          errors.push(`${context} amount cannot use power-based scaling.`);
        }
        if (effect.allowPartial !== undefined && typeof effect.allowPartial !== "boolean") {
          errors.push(`${context} allowPartial must be a boolean.`);
        }
        if (effect.gateAll !== undefined && typeof effect.gateAll !== "boolean") {
          errors.push(`${context} gateAll must be a boolean.`);
        }
        if (effect.gateDamage !== undefined && typeof effect.gateDamage !== "boolean") {
          errors.push(`${context} gateDamage must be a boolean.`);
        }
        break;
      }
      case "deal_damage_per_spent": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        break;
      }
      case "draw_cards": {
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.amount?.kind === "power" || effect.amount?.kind === "power_div") {
          errors.push(`${context} amount cannot use power-based scaling.`);
        }
        if (effect.target !== undefined && !effectTargets.has(effect.target)) {
          errors.push(`${context} has invalid target "${effect.target}".`);
        }
        break;
      }
      case "create_card": {
        if (typeof effect.cardName !== "string" || !effect.cardName.trim()) {
          errors.push(`${context} missing cardName.`);
        }
        validateAmount(effect.count, `${context}.count`, errors);
        if (effect.count?.kind === "power" || effect.count?.kind === "power_div") {
          errors.push(`${context} count cannot use power-based scaling.`);
        }
        if (effect.target !== undefined && !effectTargets.has(effect.target)) {
          errors.push(`${context} has invalid target "${effect.target}".`);
        }
        break;
      }
      case "block_play": {
        if (effect.target !== undefined && !effectTargets.has(effect.target)) {
          errors.push(`${context} has invalid target "${effect.target}".`);
        }
        if (effect.duration !== "combat_round") {
          errors.push(`${context} has invalid duration "${effect.duration}".`);
        }
        break;
      }
      case "reload_equipped": {
        break;
      }
      case "switch_equip": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        break;
      }
      case "grant_keyword": {
        if (typeof effect.keyword !== "string" || !effect.keyword.trim()) {
          errors.push(`${context} missing keyword.`);
        }
        if (effect.resource !== undefined && typeof effect.resource !== "string") {
          errors.push(`${context} resource must be a string.`);
        }
        if (effect.minSpent !== undefined && typeof effect.minSpent !== "number") {
          errors.push(`${context} minSpent must be a number.`);
        }
        break;
      }
      case "reduce_status": {
        if (typeof effect.status !== "string" || !effect.status.trim()) {
          errors.push(`${context} missing status.`);
        }
        validateAmount(effect.amount, `${context}.amount`, errors);
        if (effect.target !== undefined && !effectTargets.has(effect.target)) {
          errors.push(`${context} has invalid target "${effect.target}".`);
        }
        if (effect.minValue !== undefined && typeof effect.minValue !== "number") {
          errors.push(`${context} minValue must be a number.`);
        }
        if (effect.maxAmount !== undefined && typeof effect.maxAmount !== "number") {
          errors.push(`${context} maxAmount must be a number.`);
        }
        break;
      }
      case "choose": {
        if (!Array.isArray(effect.options)) {
          errors.push(`${context} missing options array.`);
          break;
        }
        effect.options.forEach((option, optionIndex) => {
          if (!option || typeof option !== "object") {
            errors.push(`${context} options[${optionIndex}] is not an object.`);
            return;
          }
          if (option.effects === undefined) {
            errors.push(`${context} options[${optionIndex}] missing effects.`);
            return;
          }
          validateEffectList(
            option.effects,
            `${label} effects[${effectIndex}].options[${optionIndex}]`,
            filename,
            errors
          );
        });
        break;
      }
      case "retain":
      default:
        break;
    }
  });
};

const validateRestrictions = (restrictions, label, filename, errors) => {
  if (!Array.isArray(restrictions)) {
    errors.push(`${filename}: ${label} restrictions must be an array.`);
    return;
  }
  restrictions.forEach((restriction, restrictionIndex) => {
    if (!restriction || typeof restriction !== "object") {
      errors.push(
        `${filename}: ${label} restrictions[${restrictionIndex}] is not an object.`
      );
      return;
    }
    if (!restrictionKinds.has(restriction.kind)) {
      errors.push(
        `${filename}: ${label} restrictions[${restrictionIndex}] has invalid kind "${restriction.kind}".`
      );
    }
    if (!restrictionSubjects.has(restriction.subject)) {
      errors.push(
        `${filename}: ${label} restrictions[${restrictionIndex}] has invalid subject "${restriction.subject}".`
      );
    }
    if (!restrictionModes.has(restriction.mode)) {
      errors.push(
        `${filename}: ${label} restrictions[${restrictionIndex}] has invalid mode "${restriction.mode}".`
      );
    }
    if (!Array.isArray(restriction.statuses)) {
      errors.push(
        `${filename}: ${label} restrictions[${restrictionIndex}] statuses must be an array.`
      );
      return;
    }
    restriction.statuses.forEach((status, statusIndex) => {
      if (!status || typeof status !== "object") {
        errors.push(
          `${filename}: ${label} restrictions[${restrictionIndex}] statuses[${statusIndex}] is not an object.`
        );
        return;
      }
      if (typeof status.name !== "string" || !status.name.trim()) {
        errors.push(
          `${filename}: ${label} restrictions[${restrictionIndex}] statuses[${statusIndex}] missing name.`
        );
      }
      if (status.min !== undefined && (typeof status.min !== "number" || status.min < 1)) {
        errors.push(
          `${filename}: ${label} restrictions[${restrictionIndex}] statuses[${statusIndex}] min must be a number >= 1.`
        );
      }
    });
  });
};

const validateCardList = (cards, label, filename, errors) => {
  if (!Array.isArray(cards)) {
    errors.push(`${filename}: ${label} must be an array.`);
    return;
  }
  cards.forEach((card, index) => {
    if (!card || typeof card !== "object") {
      errors.push(`${filename}: ${label}[${index}] is not an object.`);
      return;
    }
    cardFields.forEach((field) => {
      if (!(field in card)) {
        errors.push(`${filename}: ${label}[${index}] missing "${field}".`);
      }
    });
    if (card.types && !Array.isArray(card.types)) {
      errors.push(`${filename}: ${label}[${index}] types must be an array.`);
    }
    if (card.effect && !Array.isArray(card.effect)) {
      errors.push(`${filename}: ${label}[${index}] effect must be an array.`);
    }
    if (card.effects !== undefined) {
      validateEffectList(card.effects, `${label}[${index}]`, filename, errors);
    }
    if (card.restrictions !== undefined) {
      validateRestrictions(card.restrictions, `${label}[${index}]`, filename, errors);
    }
    if (card.transforms !== undefined) {
      if (!Array.isArray(card.transforms)) {
        errors.push(`${filename}: ${label}[${index}] transforms must be an array.`);
      } else {
        card.transforms.forEach((transform, transformIndex) => {
          if (!transform || typeof transform !== "object") {
            errors.push(
              `${filename}: ${label}[${index}] transforms[${transformIndex}] is not an object.`
            );
            return;
          }
          transformFields.forEach((field) => {
            if (!(field in transform)) {
              errors.push(
                `${filename}: ${label}[${index}] transforms[${transformIndex}] missing "${field}".`
              );
            }
          });
          if (transform.condition && typeof transform.condition === "object") {
            transformConditionFields.forEach((field) => {
              if (!(field in transform.condition)) {
                errors.push(
                  `${filename}: ${label}[${index}] transforms[${transformIndex}] condition missing "${field}".`
                );
              }
            });
          }
        });
      }
    }
  });
};

const readYaml = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return YAML.parse(raw);
};

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });
const writeJson = (filePath, data) =>
  fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");

const slugFromFilename = (filename) => filename.replace(/\.(yml|yaml)$/i, "");

const validateEntries = (entries, label, filename, requiredFields, errors) => {
  if (!Array.isArray(entries)) {
    errors.push(`${filename}: ${label} must be an array.`);
    return;
  }

  const seen = new Set();
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${filename}: ${label}[${index}] is not an object.`);
      return;
    }
    requiredFields.forEach((field) => {
      if (!(field in entry)) {
        errors.push(`${filename}: ${label}[${index}] missing "${field}".`);
      }
    });
    if (entry.id) {
      if (seen.has(entry.id)) {
        errors.push(`${filename}: ${label} has duplicate id "${entry.id}".`);
      }
      seen.add(entry.id);
    }
    if (entry.rules && !Array.isArray(entry.rules)) {
      errors.push(`${filename}: ${label}[${index}] rules must be an array.`);
    }
  });
};

const validateCharacter = async (data, filename, errors, warnings) => {
  if (!data || typeof data !== "object") {
    errors.push(`${filename}: file did not parse into an object.`);
    return false;
  }

  requiredFields.forEach((field) => {
    if (!(field in data)) {
      errors.push(`${filename}: missing required field "${field}".`);
    }
  });

  const slug = slugFromFilename(filename);
  if (data.id && data.id !== slug) {
    errors.push(`${filename}: id "${data.id}" does not match filename slug "${slug}".`);
  }

  if (Array.isArray(data.roles) && !data.roles.length) {
    warnings.push(`${filename}: roles is empty.`);
  }

  if (Array.isArray(data.cards) && !data.cards.length) {
    errors.push(`${filename}: cards array is empty.`);
  }
  if (Array.isArray(data.cards)) {
    validateCardList(data.cards, "cards", filename, errors);
  }

  if (data.createdCards !== undefined) {
    validateCardList(data.createdCards, "createdCards", filename, errors);
  }

  if (data.art) {
    const artPath = path.join(assetsDir, data.art);
    try {
      await fs.access(artPath);
    } catch {
      errors.push(`${filename}: art file not found at docs/assets/characters/${data.art}.`);
    }
  }

  return !errors.length;
};

const copyAssets = async (characters) => {
  await ensureDir(assetsOutDir);
  const copied = new Set();
  for (const character of characters) {
    if (!character.art || copied.has(character.art)) continue;
    const src = path.join(assetsDir, character.art);
    const dest = path.join(assetsOutDir, character.art);
    await fs.copyFile(src, dest);
    copied.add(character.art);
  }
};

const exportData = async () => {
  const entries = await fs.readdir(charactersDir);
  const errors = [];
  const warnings = [];
  const characters = [];
  const sharedData = {};

  for (const entry of entries) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const filePath = path.join(charactersDir, entry);
    const data = await readYaml(filePath);
    const ok = await validateCharacter(data, entry, errors, warnings);
    if (ok) characters.push(data);
  }

  for (const config of dataFileConfigs) {
    const filePath = path.join(dataDir, config.filename);
    const data = await readYaml(filePath);
    if (!data || typeof data !== "object") {
      errors.push(`${config.filename}: file did not parse into an object.`);
      continue;
    }
    const entriesList = data[config.root];
    validateEntries(entriesList, config.root, config.filename, config.requiredFields, errors);
    if (Array.isArray(entriesList)) {
      sharedData[config.key] = entriesList;
    }
  }

  if (warnings.length) {
    warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  }

  if (errors.length) {
    errors.forEach((error) => console.error(`Error: ${error}`));
    process.exitCode = 1;
    return;
  }

  await ensureDir(outDir);
  await writeJson(path.join(outDir, "characters.json"), { characters });
  for (const config of dataFileConfigs) {
    const entriesList = sharedData[config.key] ?? [];
    await writeJson(path.join(outDir, config.output), { [config.root]: entriesList });
  }

  await copyAssets(characters);
  console.log(`Exported ${characters.length} character(s) to ${outDir}.`);
};

exportData().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
