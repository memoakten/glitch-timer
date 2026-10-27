import {
  settingGroups,
  scrubKeys,
  formatDuration,
  formatSetting,
} from "./settings.mjs";

export function buildSettingsForm(document) {
  const container = document.getElementById("settings-fields");
  container.replaceChildren();
  const inputs = {};
  const controls = {};
  for (const group of settingGroups) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "settings-group";
    const legend = document.createElement("legend");
    legend.textContent = group.label;
    fieldset.append(legend);

    for (const field of group.fields) {
      const row = document.createElement("div");
      row.className = "setting-row";
      const copy = document.createElement("div");
      copy.className = "setting-copy";
      const label = document.createElement("label");
      label.htmlFor = field.id;
      label.textContent = field.label;
      copy.append(label);

      const control = document.createElement("div");
      control.className = "setting-control";
      const input = document.createElement(
        field.kind === "choice" ? "select" : "input",
      );
      input.id = field.id;
      input.name = field.key;
      input.required = true;
      if (field.kind === "choice") {
        for (const name of field.options) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          input.append(option);
        }
      } else {
        input.type =
          field.control ?? (field.kind === "integer" ? "number" : "text");
        if (field.kind === "integer") {
          input.min = field.min;
          input.max = field.max;
          input.step = 1;
        }
      }

      if (field.help) {
        const help = document.createElement("small");
        help.id = `${field.id}-help`;
        if (typeof field.help === "string") {
          help.textContent = field.help;
        } else {
          const link = document.createElement("a");
          link.textContent = field.help.text;
          link.href = field.help.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          help.append(link);
        }
        copy.append(help);
        input.setAttribute("aria-describedby", help.id);
      }
      control.append(input);
      if (field.unit) {
        control.classList.add("range-control");
        const output = document.createElement("output");
        output.id = `${field.id}-value`;
        output.setAttribute("for", field.id);
        input.addEventListener("input", () => {
          output.textContent = formatSetting(field.key, input.value, {
            includeUnit: true,
          });
        });
        control.append(output);
      }
      if (field.presets) {
        const presets = document.createElement("div");
        presets.className = "presets";
        for (const duration of field.presets) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = formatDuration(duration);
          button.onclick = () => {
            input.value = formatDuration(duration);
          };
          presets.append(button);
        }
        control.append(presets);
      }
      inputs[field.key] = input;
      controls[field.key] = control;
      row.append(copy, control);
      fieldset.append(row);
    }
    container.append(fieldset);
  }

  const preview = document.createElement("button");
  preview.id = "preview-sound";
  preview.type = "button";
  preview.textContent = "▶ Preview sound";
  controls.count.append(preview);

  const scrubHelp = document.getElementById("scrub-hint");
  scrubHelp.replaceChildren();
  for (const shortcut of Object.values(scrubKeys)) {
    const key = document.createElement("kbd");
    key.textContent = shortcut.label;
    const change = -shortcut.elapsedChange;
    const text = document.createElement("span");
    text.textContent = `${change > 0 ? "+" : "−"}${formatDuration(Math.abs(change))}`;
    scrubHelp.append(key, text);
  }
  return inputs;
}
