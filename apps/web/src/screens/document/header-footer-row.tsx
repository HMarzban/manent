// The Header and Footer setting row: a preset select, optional three-slot custom editor, and first-page and rule switches.
import { SETTINGS } from "@manent/settings";
import type { HeaderSlots, SettingKey, SettingsStore } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  HEADER_FOOTER_WORDS,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  messageFor,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import {
  FOOTER_PRESET_ITEMS,
  FOOTER_PRESET_SLOTS,
  HEADER_PRESET_ITEMS,
  HEADER_PRESET_SLOTS,
  SLOT_KIND_ITEMS,
  SLOT_POSITIONS,
  detectPreset,
  isHeaderFooterKey,
  presetLabel,
  slotForKind,
  writeHeaderSlots,
} from "./header-footer-presets.ts";
import type {
  FooterPresetId,
  HeaderFooterKey,
  HeaderPresetId,
  PresetId,
  SlotKind,
  SlotPosition,
} from "./header-footer-presets.ts";

function SlotTextField(props: {
  value: string;
  label: string;
  placeholder: string;
  disabled: boolean;
  onCommit(text: string): void;
}): ReactNode {
  const { value, label, placeholder, disabled, onCommit } = props;
  const [typed, setTyped] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const type = (text: string | null): void => {
    pending.current = text;
    setTyped(text);
  };
  const end = (commit: boolean): void => {
    const text = pending.current;
    type(null);
    if (commit && text !== null && text !== value) onCommit(text);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") end(true);
    if (event.key === "Escape") {
      event.stopPropagation();
      end(false);
    }
  };
  return (
    <Input
      value={typed ?? value}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => type(event.target.value)}
      onBlur={() => end(true)}
      onKeyDown={onKeyDown}
    />
  );
}

/** The custom setting row for `script.header`, `script.footer`, `project.header` and `project.footer`. */
export function HeaderFooterRow(props: {
  settingKey: SettingKey;
  docId?: string;
  projectId?: string;
}): ReactNode {
  const { settingKey } = props;
  const store = useSettingsStore();
  const { messages, reverses } = useServices();
  const [customOpen, setCustomOpen] = useState(false);
  const id = useId();

  if (!isHeaderFooterKey(settingKey)) return null;

  return (
    <HeaderFooterRowBody
      settingKey={settingKey}
      store={store}
      messages={messages}
      reverses={reverses}
      customOpen={customOpen}
      setCustomOpen={setCustomOpen}
      id={id}
    />
  );
}

function HeaderFooterRowBody(props: {
  settingKey: HeaderFooterKey;
  store: SettingsStore;
  messages: ReturnType<typeof useServices>["messages"];
  reverses: ReturnType<typeof useServices>["reverses"];
  customOpen: boolean;
  setCustomOpen: (open: boolean) => void;
  id: string;
}): ReactNode {
  const {
    settingKey,
    store,
    messages,
    reverses,
    customOpen,
    setCustomOpen,
    id,
  } = props;
  const slots = useSetting(settingKey);
  const { writable } = store.explain(settingKey);
  const def = SETTINGS.get(settingKey);
  const isHeader =
    settingKey === "script.header" || settingKey === "project.header";

  const detectedPreset = detectPreset(slots, isHeader);
  const activePreset: PresetId =
    customOpen || detectedPreset === "custom" ? "custom" : detectedPreset;
  const presetItems = isHeader ? HEADER_PRESET_ITEMS : FOOTER_PRESET_ITEMS;

  const announce = (valueLabel: string, onUndo: () => void): void => {
    const message = messageFor({
      kind: "setting_changed",
      byName: null,
      noun: def.noun ?? def.label,
      valueLabel,
      pagesBefore: null,
      pagesAfter: null,
    });
    reverses.set(message.id, onUndo);
    messages.push(message);
  };

  const handlePresetChange = (next: PresetId | null): void => {
    if (next === null || next === activePreset) return;
    const before = slots;
    const label = presetLabel(next, isHeader);
    if (next === "custom") {
      setCustomOpen(true);
      return;
    }
    const triple = isHeader
      ? HEADER_PRESET_SLOTS[next as Exclude<HeaderPresetId, "custom">]
      : FOOTER_PRESET_SLOTS[next as Exclude<FooterPresetId, "custom">];
    const updated: HeaderSlots = {
      ...triple,
      firstPage: slots.firstPage,
      rule: slots.rule,
    };
    setCustomOpen(false);
    if (writeHeaderSlots(store, settingKey, updated)) {
      announce(label, () => writeHeaderSlots(store, settingKey, before));
    }
  };

  const handleSlotKind = (pos: SlotPosition, kind: SlotKind | null): void => {
    if (kind === null) return;
    const before = slots;
    const updated: HeaderSlots = {
      ...slots,
      [pos]: slotForKind(kind, slots[pos]),
    };
    if (writeHeaderSlots(store, settingKey, updated)) {
      announce(HEADER_FOOTER_WORDS.slotKinds[kind], () =>
        writeHeaderSlots(store, settingKey, before),
      );
    }
  };

  const handleSlotText = (pos: SlotPosition, text: string): void => {
    const before = slots;
    const updated: HeaderSlots = {
      ...slots,
      [pos]: { kind: "custom", text },
    };
    if (writeHeaderSlots(store, settingKey, updated)) {
      announce(HEADER_FOOTER_WORDS.slotKinds.custom, () =>
        writeHeaderSlots(store, settingKey, before),
      );
    }
  };

  const handleFirstPage = (checked: boolean): void => {
    const before = slots;
    const updated: HeaderSlots = { ...slots, firstPage: checked };
    if (writeHeaderSlots(store, settingKey, updated)) {
      announce(
        checked ? DOCUMENT_WORDS.switchOn : DOCUMENT_WORDS.switchOff,
        () => writeHeaderSlots(store, settingKey, before),
      );
    }
  };

  const handleRule = (checked: boolean): void => {
    const before = slots;
    const updated: HeaderSlots = { ...slots, rule: checked };
    if (writeHeaderSlots(store, settingKey, updated)) {
      announce(
        checked ? DOCUMENT_WORDS.switchOn : DOCUMENT_WORDS.switchOff,
        () => writeHeaderSlots(store, settingKey, before),
      );
    }
  };

  const labelId = `${id}-label`;
  const firstPageId = `${id}-first-page`;
  const ruleId = `${id}-rule`;
  const ruleHelpId = `${id}-rule-help`;

  return (
    <div
      data-tour={`setting:${settingKey}`}
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2 py-1"
    >
      <div className="flex min-h-row items-center justify-between gap-4">
        <span id={labelId} className="text-ui font-medium">
          {def.label}
        </span>
        <Select
          items={presetItems}
          value={activePreset}
          onValueChange={(value) => handlePresetChange(value as PresetId)}
          disabled={!writable}
        >
          <SelectTrigger aria-labelledby={labelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {activePreset === "custom" ? (
        <div className="flex flex-col gap-2 pl-3">
          {SLOT_POSITIONS.map((pos) => {
            const slot = slots[pos];
            const slotLabelId = `${id}-slot-${pos}`;
            const slotLabel = HEADER_FOOTER_WORDS.slots[pos];
            return (
              <div key={pos} className="flex flex-col gap-1">
                <div className="flex min-h-row items-center justify-between gap-4">
                  <span id={slotLabelId} className="text-ui text-fg-muted">
                    {slotLabel}
                  </span>
                  <Select
                    items={SLOT_KIND_ITEMS}
                    value={slot.kind}
                    onValueChange={(kind) =>
                      handleSlotKind(pos, kind as SlotKind)
                    }
                    disabled={!writable}
                  >
                    <SelectTrigger aria-labelledby={slotLabelId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOT_KIND_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {slot.kind === "custom" ? (
                  <SlotTextField
                    value={slot.text}
                    label={HEADER_FOOTER_WORDS.slotTextField}
                    placeholder={HEADER_FOOTER_WORDS.slotTextField}
                    disabled={!writable}
                    onCommit={(text) => handleSlotText(pos, text)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="flex min-h-row items-center justify-between gap-4 pl-3">
        <span id={firstPageId} className="text-ui text-fg-muted">
          {HEADER_FOOTER_WORDS.firstPage}
        </span>
        <Switch
          checked={slots.firstPage}
          aria-labelledby={firstPageId}
          disabled={!writable}
          onCheckedChange={handleFirstPage}
        />
      </div>
      <div className="flex min-h-row-2 items-center justify-between gap-4 pl-3">
        <div className="flex min-w-0 flex-col">
          <span id={ruleId} className="text-ui text-fg-muted">
            {HEADER_FOOTER_WORDS.rule}
          </span>
          <p id={ruleHelpId} className="text-meta text-fg-muted">
            {isHeader
              ? HEADER_FOOTER_WORDS.headerRuleLine
              : HEADER_FOOTER_WORDS.footerRuleLine}
          </p>
        </div>
        <Switch
          checked={slots.rule}
          aria-labelledby={ruleId}
          aria-describedby={ruleHelpId}
          disabled={!writable}
          onCheckedChange={handleRule}
        />
      </div>
    </div>
  );
}
