import { sendOpenAIRequest, oai_settings, model_list } from "../../../openai.js";
import { extractAllWords } from "../../../utils.js";
import { getTokenCount } from "../../../tokenizers.js";
import { getNovelGenerationData, generateNovelWithStreaming, nai_settings } from "../../../nai-settings.js";
import { generateHorde, MIN_LENGTH } from "../../../horde.js";
import { getTextGenGenerationData, generateTextGenWithStreaming } from "../../../textgen-settings.js";
import {
    main_api,
    novelai_settings,
    novelai_setting_names,
    eventSource,
    event_types,
    saveSettingsDebounced,
    messageFormatting,
    addCopyToCodeBlocks,
    getRequestHeaders,
    generateRaw,
} from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";
import { getRegexedString, regex_placement } from '../../regex/engine.js'; // Import from built-in regex extension

const extensionName = "rewrite-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionVersion = '1.5.0';
const logPrefix = `[Rewrite Extension ${extensionVersion}]`;

console.info(`${logPrefix} Module loaded from ${import.meta.url}`);

const chatCompletionModelSources = {
    openai: { setting: 'openai_model', selector: '#model_openai_select', label: 'OpenAI' },
    claude: { setting: 'claude_model', selector: '#model_claude_select', label: 'Claude' },
    openrouter: { setting: 'openrouter_model', selector: '#model_openrouter_select', label: 'OpenRouter' },
    ai21: { setting: 'ai21_model', selector: '#model_ai21_select', label: 'AI21' },
    makersuite: { setting: 'google_model', selector: '#model_google_select', label: 'Google AI Studio' },
    vertexai: { setting: 'vertexai_model', selector: '#model_vertexai_select', label: 'Vertex AI' },
    mistralai: { setting: 'mistralai_model', selector: '#model_mistralai_select', label: 'Mistral AI' },
    custom: { setting: 'custom_model', selector: '#model_custom_select', label: 'Custom API' },
    cohere: { setting: 'cohere_model', selector: '#model_cohere_select', label: 'Cohere' },
    perplexity: { setting: 'perplexity_model', selector: '#model_perplexity_select', label: 'Perplexity' },
    groq: { setting: 'groq_model', selector: '#model_groq_select', label: 'Groq' },
    electronhub: { setting: 'electronhub_model', selector: '#model_electronhub_select', label: 'ElectronHub' },
    chutes: { setting: 'chutes_model', selector: '#model_chutes_select', label: 'Chutes' },
    nanogpt: { setting: 'nanogpt_model', selector: '#model_nanogpt_select', label: 'NanoGPT' },
    deepseek: { setting: 'deepseek_model', selector: '#model_deepseek_select', label: 'DeepSeek' },
    aimlapi: { setting: 'aimlapi_model', selector: '#model_aimlapi_select', label: 'AI/ML API' },
    xai: { setting: 'xai_model', selector: '#model_xai_select', label: 'xAI' },
    pollinations: { setting: 'pollinations_model', selector: '#model_pollinations_select', label: 'Pollinations' },
    moonshot: { setting: 'moonshot_model', selector: '#model_moonshot_select', label: 'Moonshot' },
    fireworks: { setting: 'fireworks_model', selector: '#model_fireworks_select', label: 'Fireworks AI' },
    cometapi: { setting: 'cometapi_model', selector: '#model_cometapi_select', label: 'CometAPI' },
    azure_openai: { setting: 'azure_openai_model', selector: '#azure_openai_model', label: 'Azure OpenAI' },
    zai: { setting: 'zai_model', selector: '#model_zai_select', label: 'Z.AI' },
    siliconflow: { setting: 'siliconflow_model', selector: '#model_siliconflow_select', label: 'SiliconFlow' },
    workers_ai: { setting: 'workers_ai_model', selector: '#model_workers_ai_select', label: 'Workers AI' },
    minimax: { setting: 'minimax_model', selector: '#model_minimax_select', label: 'MiniMax' },
};

const undo_steps = 15;

// Default settings
const defaultSettings = {
    rewritePreset: "",
    shortenPreset: "",
    expandPreset: "",
    customPreset: "", 
    highlightDuration: 3000,
    selectedModel: "chat_completion",
    textRewritePrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style and length. Do not list alternatives and only print the result without prefix or suffix.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textShortenPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Shorten it by roughly 20%.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textExpandPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Lengthen it by roughly 20%.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textCustomPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" according to the following instructions: "{{custom_instructions}}". Keep the general style. Do not list alternatives and only print the result without prefix or suffix.[/INST]

Sure, here is only the rewritten text without any comments: `, 
    useStreaming: true,
    useDynamicTokens: true,
    dynamicTokenMode: 'multiplicative',
    rewriteTokens: 100,
    shortenTokens: 50,
    expandTokens: 150,
    customTokens: 100, 
    rewriteTokensAdd: 0,
    shortenTokensAdd: -50,
    expandTokensAdd: 50,
    customTokensAdd: 0, 
    rewriteTokensMult: 1.05,
    shortenTokensMult: 0.8,
    expandTokensMult: 1.5,
    customTokensMult: 1.0, 
    removePrefix: `"`,
    removeSuffix: `"`,
    overrideMaxTokens: true,
    showRewrite: true,
    showShorten: true,
    showExpand: true,
    showCustom: true, 
    showDelete: true,
    applyRegexOnRewrite: true, // New setting to control regex application
};

const actionsVersion = 2;

const legacyActionDefinitions = [
    {
        id: 'rewrite',
        name: 'Rewrite',
        presetKey: 'rewritePreset',
        promptKey: 'textRewritePrompt',
        tokensKey: 'rewriteTokens',
        tokensAddKey: 'rewriteTokensAdd',
        tokensMultKey: 'rewriteTokensMult',
        visibleKey: 'showRewrite',
    },
    {
        id: 'shorten',
        name: 'Shorten',
        presetKey: 'shortenPreset',
        promptKey: 'textShortenPrompt',
        tokensKey: 'shortenTokens',
        tokensAddKey: 'shortenTokensAdd',
        tokensMultKey: 'shortenTokensMult',
        visibleKey: 'showShorten',
    },
    {
        id: 'expand',
        name: 'Expand',
        presetKey: 'expandPreset',
        promptKey: 'textExpandPrompt',
        tokensKey: 'expandTokens',
        tokensAddKey: 'expandTokensAdd',
        tokensMultKey: 'expandTokensMult',
        visibleKey: 'showExpand',
    },
    {
        id: 'custom',
        name: 'Custom',
        presetKey: 'customPreset',
        promptKey: 'textCustomPrompt',
        tokensKey: 'customTokens',
        tokensAddKey: 'customTokensAdd',
        tokensMultKey: 'customTokensMult',
        visibleKey: 'showCustom',
        askForInstructions: true,
    },
    {
        id: 'delete',
        name: 'Delete',
        kind: 'delete',
        visibleKey: 'showDelete',
    },
];

let availablePresetNames = [];

function createActionId() {
    if (globalThis.crypto?.randomUUID) {
        return `action-${globalThis.crypto.randomUUID()}`;
    }

    return `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDefaultAction(overrides = {}) {
    return {
        id: createActionId(),
        name: 'New Button',
        kind: 'generate',
        visible: true,
        askForInstructions: false,
        askForTokenMultiplier: false,
        preset: availablePresetNames[0] || '',
        prompt: defaultSettings.textRewritePrompt,
        tokens: defaultSettings.rewriteTokens,
        tokensAdd: defaultSettings.rewriteTokensAdd,
        tokensMult: defaultSettings.rewriteTokensMult,
        ...overrides,
    };
}

function migrateLegacyActions(settings) {
    return legacyActionDefinitions.map(definition => getDefaultAction({
        id: definition.id,
        name: definition.name,
        kind: definition.kind || 'generate',
        visible: settings[definition.visibleKey],
        askForInstructions: Boolean(definition.askForInstructions),
        preset: definition.presetKey ? settings[definition.presetKey] : '',
        prompt: definition.promptKey ? settings[definition.promptKey] : defaultSettings.textRewritePrompt,
        tokens: definition.tokensKey ? settings[definition.tokensKey] : defaultSettings.rewriteTokens,
        tokensAdd: definition.tokensAddKey ? settings[definition.tokensAddKey] : defaultSettings.rewriteTokensAdd,
        tokensMult: definition.tokensMultKey ? settings[definition.tokensMultKey] : defaultSettings.rewriteTokensMult,
    }));
}

function normalizeAction(action, usedIds) {
    const fallback = getDefaultAction();
    let id = typeof action?.id === 'string' && action.id ? action.id : fallback.id;
    if (usedIds.has(id)) {
        id = createActionId();
    }
    usedIds.add(id);

    return {
        id,
        name: typeof action?.name === 'string' ? action.name : fallback.name,
        kind: action?.kind === 'delete' ? 'delete' : 'generate',
        visible: typeof action?.visible === 'boolean' ? action.visible : fallback.visible,
        askForInstructions: typeof action?.askForInstructions === 'boolean'
            ? action.askForInstructions
            : fallback.askForInstructions,
        askForTokenMultiplier: typeof action?.askForTokenMultiplier === 'boolean'
            ? action.askForTokenMultiplier
            : fallback.askForTokenMultiplier,
        preset: typeof action?.preset === 'string' ? action.preset : fallback.preset,
        prompt: typeof action?.prompt === 'string' ? action.prompt : fallback.prompt,
        tokens: Number.isFinite(Number(action?.tokens)) ? Number(action.tokens) : fallback.tokens,
        tokensAdd: Number.isFinite(Number(action?.tokensAdd)) ? Number(action.tokensAdd) : fallback.tokensAdd,
        tokensMult: Number.isFinite(Number(action?.tokensMult)) ? Number(action.tokensMult) : fallback.tokensMult,
    };
}

function ensureActions(settings) {
    if (!Array.isArray(settings.actions)) {
        settings.actions = migrateLegacyActions(settings);
        settings.actionsVersion = actionsVersion;
        return true;
    }

    const previousActions = JSON.stringify(settings.actions);
    const usedIds = new Set();
    settings.actions = settings.actions.map(action => normalizeAction(action, usedIds));
    const changed = previousActions !== JSON.stringify(settings.actions)
        || settings.actionsVersion !== actionsVersion;
    settings.actionsVersion = actionsVersion;
    return changed;
}

function getActions() {
    return extension_settings[extensionName]?.actions || [];
}

function getAction(actionId) {
    return getActions().find(action => action.id === actionId);
}

function getDiagnostics() {
    const settings = extension_settings[extensionName];
    return {
        version: extensionVersion,
        moduleUrl: import.meta.url,
        settingsPresent: Boolean(settings),
        actionsIsArray: Array.isArray(settings?.actions),
        configuredActions: Array.isArray(settings?.actions) ? settings.actions.length : 0,
        renderedActions: document.querySelectorAll('#rewrite_actions .rewrite-action-card').length,
        addButtonPresent: Boolean(document.getElementById('add_rewrite_action')),
    };
}

function setSettingsStatus(message, isError = false) {
    const status = document.getElementById('rewrite_extension_status');
    if (!status) {
        return;
    }

    status.textContent = `v${extensionVersion}: ${message}`;
    status.classList.toggle('failure', isError);
}

globalThis.getRewriteExtensionDiagnostics = () => {
    const diagnostics = getDiagnostics();
    console.table(diagnostics);
    return diagnostics;
};

let rewriteMenu = null;
let lastSelection = null;
let abortController;

let changeHistory = [];

function ensureSettingsState() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    // Keep the runtime settings in sync with the defaults shown in the UI.
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = value;
        }
    }

    const actionsChanged = ensureActions(settings);
    return { settings, actionsChanged };
}

// Load settings
function loadSettings() {
    const { settings, actionsChanged } = ensureSettingsState();
    console.info(`${logPrefix} Loading settings`, {
        actionsVersion: settings.actionsVersion,
        actionCount: settings.actions.length,
    });

    // Helper function to get a setting with a default value
    const getSetting = (key, defaultValue) => {
        return extension_settings[extensionName][key] !== undefined
            ? extension_settings[extensionName][key]
            : defaultValue;
    };

    // Load settings, using defaults if not set
    $("#highlight_duration").val(getSetting('highlightDuration', defaultSettings.highlightDuration));
    $("#rewrite_extension_model_select").val(getSetting('selectedModel', defaultSettings.selectedModel));
    $("#use_streaming").prop('checked', getSetting('useStreaming', defaultSettings.useStreaming));
    $("#use_dynamic_tokens").prop('checked', getSetting('useDynamicTokens', defaultSettings.useDynamicTokens));
    $("#dynamic_token_mode").val(getSetting('dynamicTokenMode', defaultSettings.dynamicTokenMode));
    $("#remove_prefix").val(getSetting('removePrefix', defaultSettings.removePrefix));
    $("#remove_suffix").val(getSetting('removeSuffix', defaultSettings.removeSuffix));
    $("#override_max_tokens").prop('checked', getSetting('overrideMaxTokens', defaultSettings.overrideMaxTokens));
    $("#apply_regex_on_rewrite").prop('checked', getSetting('applyRegexOnRewrite', defaultSettings.applyRegexOnRewrite)); // Load new setting

    // Update the UI based on loaded settings
    renderActionSettings();
    updateModelSettings();
    updateTokenSettings();

    if (actionsChanged) {
        saveSettingsDebounced();
    }

    console.info(`${logPrefix} Settings rendered`, getDiagnostics());
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    Object.assign(settings, {
        highlightDuration: parseInt($("#highlight_duration").val()),
        selectedModel: $("#rewrite_extension_model_select").val(),
        useStreaming: $("#use_streaming").is(':checked'),
        useDynamicTokens: $("#use_dynamic_tokens").is(':checked'),
        dynamicTokenMode: $("#dynamic_token_mode").val(),
        removePrefix: $("#remove_prefix").val(),
        removeSuffix: $("#remove_suffix").val(),
        overrideMaxTokens: $("#override_max_tokens").is(':checked'),
        applyRegexOnRewrite: $("#apply_regex_on_rewrite").is(':checked'), // Save new setting
        actionsVersion,
    });

    // Ensure all settings have a value, using defaults if necessary
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = value;
        }
    }

    saveSettingsDebounced();
}

function createActionControl(action, field, elementName, attributes = {}) {
    const control = document.createElement(elementName);
    control.dataset.actionField = field;
    control.id = `${action.id}-${field}`;

    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') {
            control.className = value;
        } else {
            control.setAttribute(key, value);
        }
    }

    return control;
}

function createActionSettingRow(labelText, control, className = '') {
    const row = document.createElement('div');
    row.className = `rewrite-action-setting ${className}`.trim();

    const label = document.createElement('label');
    label.htmlFor = control.id;
    label.textContent = labelText;
    row.append(label, control);
    return row;
}

function populatePresetSelect(select, action) {
    select.textContent = '';
    if (action.preset && !availablePresetNames.includes(action.preset)) {
        select.appendChild(new Option(`${action.preset} (missing)`, action.preset));
    }
    for (const presetName of availablePresetNames) {
        select.appendChild(new Option(presetName, presetName));
    }
    select.value = action.preset;
}

function refreshPresetSelects() {
    document.querySelectorAll('.rewrite-action-card [data-action-field="preset"]').forEach(select => {
        const card = select.closest('.rewrite-action-card');
        const action = getAction(card?.dataset.actionId);
        if (action) {
            populatePresetSelect(select, action);
        }
    });
}

function renderActionSettings() {
    const container = document.getElementById('rewrite_actions');
    if (!container) {
        return;
    }

    container.textContent = '';
    const actions = getActions();

    if (actions.length === 0) {
        const emptyMessage = document.createElement('small');
        emptyMessage.className = 'rewrite-actions-empty';
        emptyMessage.textContent = 'No buttons configured. Use Add Button to create one.';
        container.appendChild(emptyMessage);
        return;
    }

    actions.forEach((action, index) => {
        const card = document.createElement('div');
        card.className = 'rewrite-action-card';
        card.dataset.actionId = action.id;

        const header = document.createElement('div');
        header.className = 'rewrite-action-header';

        const nameInput = createActionControl(action, 'name', 'input', {
            type: 'text',
            className: 'text_pole rewrite-action-name',
            'aria-label': 'Button name',
        });
        nameInput.value = action.name;

        const visibleLabel = document.createElement('label');
        visibleLabel.className = 'rewrite-action-visible';
        const visibleInput = createActionControl(action, 'visible', 'input', {
            type: 'checkbox',
            className: 'checkbox',
        });
        visibleInput.checked = action.visible;
        visibleLabel.append(visibleInput, document.createTextNode(' Visible'));
        header.append(nameInput, visibleLabel);

        const behaviorSelect = createActionControl(action, 'kind', 'select', { className: 'text_pole' });
        behaviorSelect.append(new Option('Generate text', 'generate'), new Option('Delete selection', 'delete'));
        behaviorSelect.value = action.kind;

        const presetSelect = createActionControl(action, 'preset', 'select', { className: 'text_pole' });
        populatePresetSelect(presetSelect, action);

        const promptInput = createActionControl(action, 'prompt', 'textarea', {
            className: 'text_pole',
            rows: '4',
            placeholder: 'Enter rewrite prompt. Use {{rewrite}} for the selected text.',
        });
        promptInput.value = action.prompt;

        const instructionsInput = createActionControl(action, 'askForInstructions', 'input', {
            type: 'checkbox',
            className: 'checkbox',
        });
        instructionsInput.checked = action.askForInstructions;
        const instructionsLabel = document.createElement('label');
        instructionsLabel.htmlFor = instructionsInput.id;
        instructionsLabel.append(instructionsInput, document.createTextNode(' Ask for instructions when clicked'));
        const instructionsRow = document.createElement('div');
        instructionsRow.className = 'rewrite-action-setting rewrite-action-instructions action-generate-setting';
        instructionsRow.appendChild(instructionsLabel);

        const tokenMultiplierPromptInput = createActionControl(action, 'askForTokenMultiplier', 'input', {
            type: 'checkbox',
            className: 'checkbox',
        });
        tokenMultiplierPromptInput.checked = action.askForTokenMultiplier;
        const tokenMultiplierPromptLabel = document.createElement('label');
        tokenMultiplierPromptLabel.htmlFor = tokenMultiplierPromptInput.id;
        tokenMultiplierPromptLabel.append(tokenMultiplierPromptInput, document.createTextNode(' Ask for token multiplier when clicked'));
        const tokenMultiplierPromptRow = document.createElement('div');
        tokenMultiplierPromptRow.className = 'rewrite-action-setting rewrite-action-instructions action-generate-setting';
        tokenMultiplierPromptRow.appendChild(tokenMultiplierPromptLabel);

        const tokensInput = createActionControl(action, 'tokens', 'input', {
            type: 'number',
            min: '1',
            className: 'text_pole',
        });
        tokensInput.value = action.tokens;

        const tokensAddInput = createActionControl(action, 'tokensAdd', 'input', {
            type: 'number',
            className: 'text_pole',
        });
        tokensAddInput.value = action.tokensAdd;

        const tokensMultInput = createActionControl(action, 'tokensMult', 'input', {
            type: 'number',
            min: '0.1',
            step: '0.05',
            className: 'text_pole',
        });
        tokensMultInput.value = action.tokensMult;

        const settings = document.createElement('div');
        settings.className = 'rewrite-action-fields';
        settings.append(
            createActionSettingRow('Behavior', behaviorSelect),
            createActionSettingRow('Chat Completion Preset', presetSelect, 'action-chat-setting action-generate-setting'),
            createActionSettingRow('Text Completion Prompt', promptInput, 'action-text-setting action-generate-setting'),
            instructionsRow,
            tokenMultiplierPromptRow,
            createActionSettingRow('Max Tokens', tokensInput, 'action-static-token action-generate-setting'),
            createActionSettingRow('Token Difference', tokensAddInput, 'action-additive-token action-generate-setting'),
            createActionSettingRow('Token Multiplier', tokensMultInput, 'action-multiplicative-token action-generate-setting'),
        );

        const controls = document.createElement('div');
        controls.className = 'rewrite-action-controls';
        const controlDefinitions = [
            ['up', 'Move Up', index === 0],
            ['down', 'Move Down', index === actions.length - 1],
            ['remove', 'Remove', false],
        ];
        for (const [command, label, disabled] of controlDefinitions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'menu_button';
            button.dataset.actionCommand = command;
            button.textContent = label;
            button.disabled = disabled;
            controls.appendChild(button);
        }

        card.append(header, settings, controls);
        container.appendChild(card);
    });

    updateActionBehaviorSettings();
    updateModelSettings();
    updateTokenSettings();
}

function updateActionBehaviorSettings() {
    document.querySelectorAll('.rewrite-action-card').forEach(card => {
        const action = getAction(card.dataset.actionId);
        const isGenerateAction = action?.kind === 'generate';
        card.querySelectorAll('.action-generate-setting').forEach(element => {
            element.style.display = isGenerateAction ? '' : 'none';
        });
    });
}

function isGenerateSetting(element) {
    const card = element.closest('.rewrite-action-card');
    return getAction(card?.dataset.actionId)?.kind === 'generate';
}

function handleActionSettingInput(event) {
    const control = event.target.closest('[data-action-field]');
    const card = event.target.closest('.rewrite-action-card');
    if (!control || !card) {
        return;
    }

    const action = getAction(card.dataset.actionId);
    if (!action) {
        return;
    }

    const field = control.dataset.actionField;
    if (control.type === 'checkbox') {
        action[field] = control.checked;
    } else if (control.type === 'number') {
        const value = Number(control.value);
        if (!Number.isFinite(value)) {
            return;
        }
        action[field] = value;
    } else {
        action[field] = control.value;
    }

    if (field === 'kind') {
        updateActionBehaviorSettings();
        updateModelSettings();
        updateTokenSettings();
    }
    saveSettings();
}

function handleActionCommand(event) {
    const commandButton = event.target.closest('[data-action-command]');
    if (!commandButton) {
        return;
    }

    const card = commandButton.closest('.rewrite-action-card');
    const actions = getActions();
    const actionIndex = actions.findIndex(action => action.id === card?.dataset.actionId);
    if (actionIndex === -1) {
        return;
    }

    if (commandButton.dataset.actionCommand === 'remove') {
        const actionName = actions[actionIndex].name.trim() || 'Unnamed button';
        if (!window.confirm(`Remove the "${actionName}" button?`)) {
            return;
        }
        actions.splice(actionIndex, 1);
    } else {
        const offset = commandButton.dataset.actionCommand === 'up' ? -1 : 1;
        const destinationIndex = actionIndex + offset;
        if (destinationIndex < 0 || destinationIndex >= actions.length) {
            return;
        }
        [actions[actionIndex], actions[destinationIndex]] = [actions[destinationIndex], actions[actionIndex]];
    }

    renderActionSettings();
    saveSettings();
}

// Populate dropdowns
async function populateDropdowns(renderActions = true) {
    try {
        const result = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getContext().getRequestHeaders(),
            body: JSON.stringify({}),
        });

        if (result.ok) {
            const data = await result.json();
            availablePresetNames = Array.isArray(data.openai_setting_names) ? data.openai_setting_names : [];
            if (renderActions) {
                renderActionSettings();
            } else {
                refreshPresetSelects();
            }
        }
    } catch (error) {
        console.warn('[Rewrite Extension] Failed to load Chat Completion presets.', error);
    }
}

function updateModelSettings() {
    const modelSelect = document.getElementById('rewrite_extension_model_select');
    const chatCompletionSettings = document.getElementById('chat_completion_settings');
    const textBasedSettings = document.getElementById('text_based_settings');

    if (modelSelect.value === 'chat_completion') {
        chatCompletionSettings.style.display = 'block';
        textBasedSettings.style.display = 'none';
    } else {
        chatCompletionSettings.style.display = 'none';
        textBasedSettings.style.display = 'block';
    }

    document.querySelectorAll('.action-chat-setting').forEach(element => {
        element.style.display = isGenerateSetting(element) && modelSelect.value === 'chat_completion' ? '' : 'none';
    });
    document.querySelectorAll('.action-text-setting').forEach(element => {
        element.style.display = isGenerateSetting(element) && modelSelect.value !== 'chat_completion' ? '' : 'none';
    });
}

function updateTokenSettings() {
    const useDynamicTokens = $("#use_dynamic_tokens").is(':checked');
    const dynamicTokenMode = $("#dynamic_token_mode").val();
    $("#dynamic_token_settings").toggle(useDynamicTokens);
    $(".action-static-token").each((_, element) => {
        $(element).toggle(isGenerateSetting(element) && !useDynamicTokens);
    });
    $(".action-additive-token").each((_, element) => {
        $(element).toggle(isGenerateSetting(element) && useDynamicTokens && dynamicTokenMode === 'additive');
    });
    $(".action-multiplicative-token").each((_, element) => {
        $(element).toggle(isGenerateSetting(element) && useDynamicTokens && dynamicTokenMode === 'multiplicative');
    });
}

// Initialize
jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/rewrite_settings.html?v=${extensionVersion}`);
        const settingsHost = document.getElementById('extensions_settings2');
        if (!settingsHost) {
            throw new Error('Settings container #extensions_settings2 was not found.');
        }

        settingsHost.querySelectorAll('.rewrite-extension-settings').forEach(element => element.remove());
        settingsHost.insertAdjacentHTML('beforeend', settingsHtml);
        setSettingsStatus('Initializing...');

        // Attach handlers before rendering so a settings error cannot leave the controls inert.
        $("#highlight_duration").on("change", saveSettings);
        $("#use_streaming").on("change", saveSettings);
        $("#use_dynamic_tokens, #dynamic_token_mode").on("change", () => {
            updateTokenSettings();
            saveSettings();
        });
        $("#remove_prefix, #remove_suffix").on("change", saveSettings);
        $("#override_max_tokens").on("change", saveSettings);
        $("#apply_regex_on_rewrite").on("change", saveSettings); // Add listener for new checkbox

        $("#rewrite_actions").on("input change", "[data-action-field]", handleActionSettingInput);
        $("#rewrite_actions").on("click", "[data-action-command]", handleActionCommand);

        const addButton = document.getElementById('add_rewrite_action');
        if (!addButton) {
            throw new Error('Add Button control was not found.');
        }
        addButton.addEventListener('click', () => {
            try {
                ensureSettingsState();
                getActions().push(getDefaultAction());
                renderActionSettings();
                saveSettings();
                setSettingsStatus(`Ready; ${getActions().length} buttons configured.`);
                console.info(`${logPrefix} Added button`, getDiagnostics());
            } catch (error) {
                console.error(`${logPrefix} Add Button failed`, error);
                setSettingsStatus(`Add Button failed: ${error.message}`, true);
            }
        });

        $("#rewrite_extension_model_select").on("change", () => {
            updateModelSettings();
            saveSettings();
        });

        loadSettings();

        // Add event listener for SETTINGS_UPDATED
        eventSource.on(event_types.SETTINGS_UPDATED, async () => {
            await populateDropdowns(false);
        });

        eventSource.on(event_types.CHAT_CHANGED, () => {
            changeHistory = [];
            updateUndoButtons();
        });

        eventSource.on(event_types.MESSAGE_EDITED, (editedMesId) => {
            removeUndoButton(editedMesId);
        });

        await populateDropdowns(false);
        updateModelSettings();
        setSettingsStatus(`Ready; ${getActions().length} buttons configured.`);
    } catch (error) {
        console.error(`${logPrefix} Settings initialization failed`, error);
        setSettingsStatus(`Initialization failed: ${error.message}`, true);
    }
});

// Initialize the rewrite menu functionality
initRewriteMenu();

function initRewriteMenu() {
    // document.addEventListener('mouseup', handleSelectionEnd);
    // document.addEventListener('touchend', handleSelectionEnd);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', hideMenuOnOutsideClick);
    document.addEventListener('touchstart', hideMenuOnOutsideClick);

    let chatContainer = document.getElementById('chat');
    chatContainer.addEventListener('scroll', positionMenu);

    $('#mes_stop').on('click', handleStopRewrite);
}


function handleStopRewrite() {
    if (abortController) {
        const { mesDiv, mesId, swipeId, highlightDuration } = abortController.signal;
        abortController.abort();
        // Restore the original settings
        if (abortController.signal.prev_oai_settings) {
            Object.assign(oai_settings, abortController.signal.prev_oai_settings);
        }

        getContext().activateSendButtons();

        // Call removeHighlight with the stored arguments
        setTimeout(() => removeHighlight(mesDiv, mesId, swipeId), highlightDuration);
    }
}

// function handleSelectionEnd(e) {
//     if (e.target && e.target.closest('.ctx-menu')) return;
//     removeRewriteMenu();
//     setTimeout(processSelection, 50);
// }

function handleSelectionChange() {
    // Use a small timeout to ensure the selection has been updated
    setTimeout(processSelection, 50);
}

function processSelection() {
    // First, check if getContext().chatId is defined
    if (getContext().chatId === undefined) {
        return; // Exit the function if chatId is undefined
    }

    let selection = window.getSelection();
    let selectedText = selection.toString().trim();

    // Always remove the existing menu first
    removeRewriteMenu();

    if (selectedText.length > 0) {
        let range = selection.getRangeAt(0);

        // Find the mes_text elements for both start and end of the selection
        let startMesText = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer.closest('.mes_text')
            : range.startContainer.parentElement.closest('.mes_text');

        let endMesText = range.endContainer.nodeType === Node.ELEMENT_NODE
            ? range.endContainer.closest('.mes_text')
            : range.endContainer.parentElement.closest('.mes_text');

        // Check if both start and end are within the same mes_text element
        if (startMesText && endMesText && startMesText === endMesText) {
            createRewriteMenu();
        }
    }

    lastSelection = selectedText.length > 0 ? selectedText : null;
}

async function getCustomInstructionsFromPopup(actionName) {
    const { callPopup } = getContext();
    try {
        const instructions = await callPopup(`Enter instructions for ${actionName}:`, 'input');

        // Introduce a zero-delay setTimeout to yield to the event loop
        await new Promise(resolve => setTimeout(resolve, 0));

        return instructions;
    } catch (error) {
        console.error("[Rewrite Extension] Error during custom instruction popup:", error);
        return null;
    } finally {
    }
}

async function getTokenMultiplierFromPopup(actionName, defaultMultiplier) {
    const { callPopup } = getContext();

    while (true) {
        const input = await callPopup(
            `Enter the output token multiplier for ${actionName}:`,
            'input',
            String(defaultMultiplier),
        );

        await new Promise(resolve => setTimeout(resolve, 0));

        if (input === null || input === false || String(input).trim() === '') {
            return null;
        }

        const multiplier = Number(input);
        if (Number.isFinite(multiplier) && multiplier > 0) {
            return multiplier;
        }

        toastr.error('Enter a token multiplier greater than 0.', 'Invalid Token Multiplier');
    }
}

function getChatCompletionModelOptions(source, presetSettings) {
    const sourceConfig = chatCompletionModelSources[source];
    if (!sourceConfig) {
        return null;
    }

    const models = new Map();
    const addModel = (value, label = value) => {
        const modelId = String(value ?? '').trim();
        if (!modelId) {
            return;
        }

        const modelLabel = String(label ?? modelId).trim() || modelId;
        if (!models.has(modelId) || models.get(modelId) === modelId) {
            models.set(modelId, modelLabel);
        }
    };

    const presetModel = presetSettings[sourceConfig.setting];
    addModel(presetModel);

    const modelSelector = document.querySelector(sourceConfig.selector);
    let selectorModelCount = 0;
    if (modelSelector instanceof HTMLSelectElement) {
        for (const option of modelSelector.options) {
            if (!option.disabled && String(option.value).trim()) {
                addModel(option.value, option.textContent);
                selectorModelCount++;
            }
        }
    }

    // The global list only belongs to the active source and is a fallback for an empty selector.
    if (selectorModelCount === 0 && oai_settings.chat_completion_source === source && Array.isArray(model_list)) {
        for (const model of model_list) {
            const modelId = model?.id;
            const modelLabel = model?.name && model.name !== modelId
                ? `${model.name} (${modelId})`
                : modelId;
            addModel(modelId, modelLabel);
        }
    }

    return {
        ...sourceConfig,
        presetModel: String(presetModel ?? '').trim(),
        models,
    };
}

async function selectChatCompletionModel(presetSettings, presetName) {
    const source = presetSettings.chat_completion_source;
    const modelOptions = getChatCompletionModelOptions(source, presetSettings);

    if (!modelOptions) {
        console.error(`[Rewrite Extension] Unsupported chat completion source: ${source}`);
        toastr.error(`The preset uses an unsupported source: ${source}`, 'Model Selection');
        return null;
    }

    if (modelOptions.models.size === 0) {
        console.error(`[Rewrite Extension] No models available for source: ${source}`);
        toastr.error(`No models are available for ${modelOptions.label}.`, 'Model Selection');
        return null;
    }

    const content = document.createElement('div');
    content.className = 'rewrite-model-picker';

    const heading = document.createElement('h3');
    heading.textContent = `Select ${modelOptions.label} model`;

    const description = document.createElement('p');
    description.textContent = `Preset: ${presetName}`;

    const select = document.createElement('select');
    select.className = 'text_pole';
    select.setAttribute('aria-label', `${modelOptions.label} model`);

    for (const [modelId, modelLabel] of modelOptions.models) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelLabel;
        select.appendChild(option);
    }

    if (modelOptions.presetModel) {
        select.value = modelOptions.presetModel;
    }

    content.append(heading, description, select);

    const context = getContext();
    let result;
    if (typeof context.callGenericPopup === 'function' && context.POPUP_TYPE) {
        result = await context.callGenericPopup(content, context.POPUP_TYPE.TEXT, '', {
            okButton: 'Use model',
            cancelButton: 'Cancel',
        });
    } else {
        result = await context.callPopup($(content), 'text', '', {
            okButton: 'Use model',
            cancelButton: 'Cancel',
        });
    }

    if (!result) {
        return null;
    }

    return {
        setting: modelOptions.setting,
        model: select.value,
    };
}

async function handleMenuItemClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const action = getAction(e.currentTarget.dataset.actionId);
    if (!action) {
        removeRewriteMenu();
        return;
    }
    const selection = window.getSelection();

    // Ensure there's a selection and a range
    if (!selection || selection.rangeCount === 0) {
        removeRewriteMenu();
        return;
    }

    // Capture the range *before* any awaits or potential selection changes
    const initialRange = selection.getRangeAt(0).cloneRange();
    const selectedText = initialRange.toString().trim();

    if (selectedText) {
        const mesTextElement = findClosestMesText(selection.anchorNode);
        if (mesTextElement) {
            const messageDiv = findMessageDiv(mesTextElement);
            if (messageDiv) {
                const mesId = messageDiv.getAttribute('mesid');
                const swipeId = messageDiv.getAttribute('swipeid');

                if (action.kind === 'delete') {
                    // Pass the initially captured range to handleDeleteSelection
                    await handleDeleteSelection(mesId, swipeId, initialRange);
                } else {
                    const actionName = action.name.trim() || 'this button';
                    let customInstructions = null;
                    if (action.askForInstructions) {
                        customInstructions = await getCustomInstructionsFromPopup(actionName);
                        if (customInstructions === null || String(customInstructions).trim() === '') {
                            return;
                        }
                    }

                    let runtimeAction = action;
                    if (action.askForTokenMultiplier) {
                        const tokenMultiplier = await getTokenMultiplierFromPopup(actionName, action.tokensMult);
                        if (tokenMultiplier === null) {
                            return;
                        }
                        runtimeAction = { ...action, tokenMultiplierOverride: tokenMultiplier };
                    }

                    const selectionInfo = getSelectedTextInfo(mesId, mesTextElement, initialRange);
                    if (!selectionInfo) {
                         console.error(`[Rewrite Extension] Failed to get selectionInfo for ${action.name} rewrite!`);
                         return;
                    }
                    await handleRewrite(mesId, swipeId, runtimeAction, customInstructions, selectionInfo);
                }
            }
        }
    }

    removeRewriteMenu();
    window.getSelection().removeAllRanges();
}

// Modify signature to accept the captured range
async function handleDeleteSelection(mesId, swipeId, range) {
    const mesDiv = document.querySelector(`[mesid="${mesId}"] .mes_text`);
    // Use the passed-in range to get selection info
    const { fullMessage, selectedRawText, rawStartOffset, rawEndOffset } = getSelectedTextInfo(mesId, mesDiv, range);

    // Create the new message with the deleted section removed
    const newMessage = fullMessage.slice(0, rawStartOffset) + fullMessage.slice(rawEndOffset);

    // Save the change to the history (this also calls updateUndoButtons)
    saveLastChange(mesId, swipeId, fullMessage, newMessage);

    // Update the message in the chat context
    getContext().chat[mesId].mes = newMessage;
    if (swipeId !== undefined && getContext().chat[mesId].swipes) {
        getContext().chat[mesId].swipes[swipeId] = newMessage;
    }

    // Update the UI
    mesDiv.innerHTML = messageFormatting(newMessage, getContext().name2, getContext().chat[mesId].isSystem, getContext().chat[mesId].isUser, mesId);
    addCopyToCodeBlocks(mesDiv);

    // Save the chat
    await getContext().saveChat();
}

function hideMenuOnOutsideClick(e) {
    if (rewriteMenu && !rewriteMenu.contains(e.target)) {
        removeRewriteMenu();
    }
}

function createRewriteMenu() {
    removeRewriteMenu();

    rewriteMenu = document.createElement('ul');
    rewriteMenu.className = 'list-group ctx-menu';
    rewriteMenu.style.position = 'absolute';
    rewriteMenu.style.zIndex = '1000';
    rewriteMenu.style.position = 'fixed';

    getActions().forEach(action => {
        if (action.visible) {
            let li = document.createElement('li');
            li.className = 'list-group-item ctx-item';
            li.textContent = action.name.trim() || 'Unnamed button';
            li.addEventListener('mousedown', handleMenuItemClick);
            li.addEventListener('touchstart', handleMenuItemClick);
            li.dataset.actionId = action.id;
            rewriteMenu.appendChild(li);
        }
    });

    document.body.appendChild(rewriteMenu);
    positionMenu();
}

function positionMenu() {
    if (!rewriteMenu) return;

    let selection = window.getSelection();
    let range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();

    // Calculate the menu's position
    let left = rect.left + window.pageXOffset;
    let top = rect.bottom + window.pageYOffset + 5;

    // Get the viewport dimensions
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    // Get the menu's dimensions
    let menuWidth = rewriteMenu.offsetWidth;
    let menuHeight = rewriteMenu.offsetHeight;

    // Adjust the position if the menu overflows the viewport
    if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth;
    }
    if (top + menuHeight > viewportHeight) {
        top = rect.top + window.pageYOffset - menuHeight - 5;
    }

    rewriteMenu.style.left = `${left}px`;
    rewriteMenu.style.top = `${top}px`;
}

function removeRewriteMenu() {
    if (rewriteMenu) {
        rewriteMenu.remove();
        rewriteMenu = null;
    }
}

function addUndoButton(mesId) {
    const messageDiv = document.querySelector(`[mesid="${mesId}"]`);
    if (messageDiv) {
        const mesButtons = messageDiv.querySelector('.mes_buttons');
        if (mesButtons) {
            const undoButton = document.createElement('div');
            undoButton.className = 'mes_button mes_undo_rewrite fa-solid fa-undo interactable';
            undoButton.title = 'Undo rewrite';
            undoButton.dataset.mesId = mesId;
            undoButton.addEventListener('click', handleUndo);

            if (mesButtons.children.length >= 1) {
                mesButtons.insertBefore(undoButton, mesButtons.children[1]);
            } else {
                mesButtons.appendChild(undoButton);
            }
        }
    }
}

function removeUndoButton(editedMesId) {
    // Remove all changes for this message from the changeHistory
    changeHistory = changeHistory.filter(change => change.mesId !== editedMesId);

    // Update undo buttons for other messages
    updateUndoButtons();
}

async function removeHighlight(mesDiv, mesId, swipeId) {
    const highlightSpan = mesDiv.querySelector('.animated-highlight');
    if (highlightSpan) {
        const textNode = document.createTextNode(highlightSpan.textContent);
        highlightSpan.parentNode.replaceChild(textNode, highlightSpan);
    }

    const context = getContext();
    const messageData = context.chat[mesId];

    if (messageData) {
        let messageContent;
        if (swipeId !== undefined && messageData.swipes && messageData.swipes[swipeId]) {
            messageContent = messageData.swipes[swipeId];
        } else {
            messageContent = messageData.mes;
        }

        // Format the message into HTML
        const formattedMessage = messageFormatting(
            messageContent,
            context.name2,
            messageData.isSystem,
            messageData.isUser,
            mesId
        );

        // Create a temporary div to hold the formatted message
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedMessage;

        // Apply addCopyToCodeBlocks to the temporary div
        addCopyToCodeBlocks(tempDiv);

        // Find the mes_text element within the message div
        const mesTextElement = mesDiv.closest('.mes').querySelector('.mes_text');
        if (mesTextElement) {
            // Replace the content of mes_text with the new formatted content
            mesTextElement.innerHTML = tempDiv.innerHTML;
        }
    }
}

function findClosestMesText(element) {
    while (element && element.nodeType !== 1) {
        element = element.parentElement;
    }
    while (element) {
        if (element.classList && element.classList.contains('mes_text')) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function findMessageDiv(element) {
    while (element) {
        if (element.hasAttribute('mesid') && element.hasAttribute('swipeid')) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function createTextMapping(rawText, formattedHtml) {
    const formattedText = stripHtml(formattedHtml);
    const mapping = [];
    let rawIndex = 0;
    let formattedIndex = 0;

    while (rawIndex < rawText.length && formattedIndex < formattedText.length) {
        if (rawText[rawIndex] === formattedText[formattedIndex]) {
            mapping.push([rawIndex, formattedIndex]);
            rawIndex++;
            formattedIndex++;
        } else if (rawText.substr(rawIndex, 3) === '...' && formattedText[formattedIndex] === '…') {
            // Handle ellipsis
            mapping.push([rawIndex, formattedIndex]);
            mapping.push([rawIndex + 1, formattedIndex]);
            mapping.push([rawIndex + 2, formattedIndex]);
            rawIndex += 3;
            formattedIndex++;
        } else if (formattedText[formattedIndex] === ' ' || formattedText[formattedIndex] === '\n') {
            // Skip extra whitespace in formatted text
            formattedIndex++;
        } else {
            // Skip characters in raw text that don't appear in formatted text
            rawIndex++;
        }
    }

    return {
        formattedToRaw: (formattedOffset) => {
            let low = 0;
            let high = mapping.length - 1;

            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                if (mapping[mid][1] === formattedOffset) {
                    return mapping[mid][0];
                } else if (mapping[mid][1] < formattedOffset) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            // If we didn't find an exact match, return the closest one
            if (low > 0) low--;
            return mapping[low][0] + (formattedOffset - mapping[low][1]);
        }
    };
}

function stripHtml(html) {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function getTextOffset(parent, node) {
    const treeWalker = document.createTreeWalker(
        parent,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let offset = 0;
    while (treeWalker.nextNode() !== node) {
        offset += treeWalker.currentNode.length;
    }

    return offset;
}

// Modify signature to accept the captured range
function getSelectedTextInfo(mesId, mesDiv, range) {
    // Removed: const selection = window.getSelection();
    // Removed: const range = selection.getRangeAt(0); - Use the passed-in range directly

    // Get the full message content
    const fullMessage = getContext().chat[mesId].mes;

    // Get the formatted message
    const formattedMessage = messageFormatting(fullMessage, undefined, getContext().chat[mesId].isSystem, getContext().chat[mesId].isUser, mesId);

    // Create a mapping between raw and formatted text
    const mapping = createTextMapping(fullMessage, formattedMessage);

    // Calculate the start and end offsets relative to the formatted text content
    const startOffset = getTextOffset(mesDiv, range.startContainer) + range.startOffset;
    const endOffset = getTextOffset(mesDiv, range.endContainer) + range.endOffset;

    // Map these offsets back to the raw message
    let rawStartOffset = mapping.formattedToRaw(startOffset);
    let rawEndOffset = mapping.formattedToRaw(endOffset);

    // Heuristic: Adjust offsets to include surrounding markdown if selection seems to abut it
    // Check for italics (*)
    if (rawStartOffset > 0 && rawEndOffset < fullMessage.length &&
        fullMessage[rawStartOffset - 1] === '*' && fullMessage[rawEndOffset] === '*') {
        // Avoid expanding if it looks like bold/bold-italics boundary
        const prevChar = rawStartOffset > 1 ? fullMessage[rawStartOffset - 2] : null;
        const nextChar = rawEndOffset + 1 < fullMessage.length ? fullMessage[rawEndOffset + 1] : null;
        if (prevChar !== '*' && nextChar !== '*') {
            rawStartOffset--;
            rawEndOffset++;
        }
    }
    // Check for bold (**) - ensure we don't double-adjust if italics check already expanded
    else if (rawStartOffset > 1 && rawEndOffset < fullMessage.length - 1 &&
             fullMessage.substring(rawStartOffset - 2, rawStartOffset) === '**' &&
             fullMessage.substring(rawEndOffset, rawEndOffset + 2) === '**') {
        // Avoid expanding if it looks like bold-italics boundary
        const prevChar = rawStartOffset > 2 ? fullMessage[rawStartOffset - 3] : null;
        const nextChar = rawEndOffset + 2 < fullMessage.length ? fullMessage[rawEndOffset + 2] : null;
        if (prevChar !== '*' && nextChar !== '*') {
            rawStartOffset -= 2;
            rawEndOffset += 2;
        }
    }
    // Note: This doesn't handle ***bold italics*** or nested cases perfectly, but covers common scenarios.

    // Get the selected raw text using potentially adjusted offsets
    const selectedRawText = fullMessage.substring(rawStartOffset, rawEndOffset);

    return {
        fullMessage,
        selectedRawText,
        rawStartOffset,
        rawEndOffset,
        range
    };
}

function saveLastChange(mesId, swipeId, originalContent, newContent) {
    changeHistory.push({
        mesId,
        swipeId,
        originalContent,
        newContent,
        timestamp: Date.now()
    });

    // Limit history to last n changes
    if (changeHistory.length > undo_steps) {
        changeHistory.shift();
    }

    updateUndoButtons();
}

function updateUndoButtons() {
    // Remove all existing undo buttons
    document.querySelectorAll('.mes_undo_rewrite').forEach(button => button.remove());

    // Add undo buttons for all messages with changes
    const changedMessageIds = [...new Set(changeHistory.map(change => change.mesId))];
    changedMessageIds.forEach(mesId => addUndoButton(mesId));
}

async function handleRewrite(mesId, swipeId, action, customInstructions = null, selectionInfo) {
    if (!selectionInfo) {
        console.error("[Rewrite Extension] handleRewrite called without selectionInfo!");
        return; // Cannot proceed without selection info
    }

    if (main_api === 'openai') {
        const selectedModel = extension_settings[extensionName].selectedModel;
        if (selectedModel === 'chat_completion') {
            return handleChatCompletionRewrite(mesId, swipeId, action, customInstructions, selectionInfo);
        } else {
            return handleSimplifiedChatCompletionRewrite(mesId, swipeId, action, customInstructions, selectionInfo);
        }
    } else {
        return handleTextBasedRewrite(mesId, swipeId, action, customInstructions, selectionInfo);
    }
}

async function handleChatCompletionRewrite(mesId, swipeId, action, customInstructions, selectionInfo) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText, rawStartOffset, rawEndOffset, range } = selectionInfo;
    const mesDiv = document.querySelector(`[mesid="${mesId}"] .mes_text`); // Keep getting mesDiv for highlight/DOM ops
    if (!mesDiv) { // Add check for mesDiv existence
        console.error("[Rewrite Extension] Could not find mesDiv in handleChatCompletionRewrite.");
        return;
    }

    const selectedPreset = action.preset;

    // Fetch the settings
    const result = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (!result.ok) {
        console.error('Failed to fetch settings');
        return;
    }

    const data = await result.json();
    const presetIndex = data.openai_setting_names.indexOf(selectedPreset);
    if (presetIndex === -1) {
        console.error(`[Rewrite Extension] Preset not found for ${action.name}:`, selectedPreset);
        toastr.error(`Select a valid preset for "${action.name}".`, 'Rewrite Preset');
        return;
    }

    // Save the current settings
    const prev_oai_settings = Object.assign({}, oai_settings);

    // Parse the selected preset settings
    let selectedPresetSettings;
    try {
        selectedPresetSettings = JSON.parse(data.openai_settings[presetIndex]);
    } catch (error) {
        console.error('Error parsing preset settings:', error);
        return;
    }

    const selectedModel = await selectChatCompletionModel(selectedPresetSettings, selectedPreset);
    if (!selectedModel) {
        return;
    }
    selectedPresetSettings[selectedModel.setting] = selectedModel.model;

    // Extension streaming overrides preset streaming
    selectedPresetSettings.stream_openai = extension_settings[extensionName].useStreaming;

    if (extension_settings[extensionName].overrideMaxTokens || action.tokenMultiplierOverride !== undefined) {
        selectedPresetSettings.openai_max_tokens = calculateTargetTokenCount(selectedRawText, action);
    }

    // Override oai_settings with the selected preset
    Object.assign(oai_settings, selectedPresetSettings);

    // Always generate the base prompt using the selected preset
    const promptReadyPromise = new Promise(resolve => {
        eventSource.once(event_types.CHAT_COMPLETION_PROMPT_READY, resolve);
    });
    getContext().generate('normal', {}, true); // Trigger prompt generation
    const promptData = await promptReadyPromise; // Wait for the generated prompt
    let chatToSend = promptData.chat; // Start with the generated chat array

    // Inject custom instructions if applicable
    if (action.askForInstructions && customInstructions) {
        // Find the last user message to append to
        let targetMessageIndex = -1;
        for (let i = chatToSend.length - 1; i >= 0; i--) {
            if (chatToSend[i].role === 'user') {
                targetMessageIndex = i;
                break;
            }
        }

        if (targetMessageIndex !== -1) {
            const targetMessage = chatToSend[targetMessageIndex];
            const instructionText = `\n\nAdditional Instructions:\n${customInstructions}`;

            if (Array.isArray(targetMessage.content)) {
                // Find the last text part or add a new one
                let lastTextPartIndex = -1;
                for (let j = targetMessage.content.length - 1; j >= 0; j--) {
                    if (targetMessage.content[j].type === 'text') {
                        lastTextPartIndex = j;
                        break;
                    }
                }
                if (lastTextPartIndex !== -1) {
                    targetMessage.content[lastTextPartIndex].text += instructionText;
                } else {
                    // Should not happen with standard prompts, but handle just in case
                    targetMessage.content.push({ type: 'text', text: instructionText });
                }
            } else if (typeof targetMessage.content === 'string') {
                targetMessage.content += instructionText;
            }
        } else {
            console.warn('[Rewrite Extension] Could not find a user message in the generated prompt to inject custom instructions into.');
            // Optionally, could append a new user message, but might break formatting
            // chatToSend.push({ role: "user", content: `Additional Instructions:\n${customInstructions}` });
        }
    }

    // Substitute standard macros AFTER potential custom instruction injection
    const wordCount = extractAllWords(selectedRawText).length;
    chatToSend = chatToSend.map(message => {
        if (Array.isArray(message.content)) {
            message.content = message.content.map(item => {
                if (item.type === 'text') {
                    item.text = item.text.replace(/{{rewrite}}/gi, selectedRawText);
                    item.text = item.text.replace(/{{targetmessage}}/gi, fullMessage);
                    item.text = item.text.replace(/{{rewritecount}}/gi, wordCount);
                }
                return item;
            });
        } else if (typeof message.content === 'string') {
            message.content = message.content.replace(/{{rewrite}}/gi, selectedRawText);
            message.content = message.content.replace(/{{targetmessage}}/gi, fullMessage);
            message.content = message.content.replace(/{{rewritecount}}/gi, wordCount);
        }
        return message;
    });

    // Create a new AbortController
    abortController = new AbortController();

    // Store the necessary data in the signal
    abortController.signal.prev_oai_settings = prev_oai_settings;
    abortController.signal.mesDiv = mesDiv;
    abortController.signal.mesId = mesId;
    abortController.signal.swipeId = swipeId;
    abortController.signal.highlightDuration = extension_settings[extensionName].highlightDuration;

    // Show the stop button
    getContext().deactivateSendButtons();

    let res;
    try {

        // Send the request with the prepared chat
        res = await sendOpenAIRequest('normal', chatToSend, abortController.signal);
    } catch (error) {
        console.error('[Rewrite Extension] Error during sendOpenAIRequest:', error);
        toastr.error("Rewrite failed. Check browser console (F12) for details.", "Rewrite Error");
        // Ensure cleanup happens even on error
    } finally {
        window.getSelection().removeAllRanges();
        // Restore the original settings (moved to finally)
        Object.assign(oai_settings, prev_oai_settings);
        getContext().activateSendButtons();
    }

    // If the request failed, res will be undefined, stop further processing
    if (res === undefined) {
        // Remove highlight immediately if the request failed before starting streaming/display
        removeHighlight(mesDiv, mesId, swipeId);
        return;
    }

    let newText = '';
    try {
        if (typeof res === 'function') {
            // Streaming case
            const streamingSpan = document.createElement('span');
            streamingSpan.className = 'animated-highlight';

            // Replace the selected text with the streaming span
            range.deleteContents();
            range.insertNode(streamingSpan);

            for await (const chunk of res()) {
                newText = chunk.text;
                streamingSpan.textContent = newText;
            }
        } else {
            // Non-streaming case
            newText = res?.choices?.[0]?.message?.content ?? res?.choices?.[0]?.text ?? res?.text ?? '';
            const highlightedNewText = document.createElement('span');
            highlightedNewText.className = 'animated-highlight';
            highlightedNewText.textContent = newText;

            range.deleteContents();
            range.insertNode(highlightedNewText);
        }

        // Remove highlight after x seconds when processing is complete
        const highlightDuration = extension_settings[extensionName].highlightDuration;
        setTimeout(() => removeHighlight(mesDiv, mesId, swipeId), highlightDuration);

        await saveRewrittenText(mesId, swipeId, fullMessage, rawStartOffset, rawEndOffset, newText);

    } catch (error) {
        console.error('[Rewrite Extension] Error processing API response:', error);
        toastr.error("Failed to process rewrite response. Check console.", "Processing Error");
        // Ensure highlight is removed if processing fails
        removeHighlight(mesDiv, mesId, swipeId);
    }
    // activateSendButtons is now handled in the finally block above
}

async function handleSimplifiedChatCompletionRewrite(mesId, swipeId, action, customInstructions, selectionInfo) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText, rawStartOffset, rawEndOffset, range } = selectionInfo;
    const mesDiv = document.querySelector(`[mesid="${mesId}"] .mes_text`); // Keep getting mesDiv for highlight/DOM ops
    if (!mesDiv) { // Add check for mesDiv existence
        console.error("[Rewrite Extension] Could not find mesDiv in handleSimplifiedChatCompletionRewrite.");
        return;
    }
    const promptTemplate = action.prompt;

    // Get amount of words
    const wordCount = extractAllWords(selectedRawText).length;

    // Replace macros in the prompt template
    let prompt = getContext().substituteParams(promptTemplate);

    prompt = prompt
        .replace(/{{rewrite}}/gi, selectedRawText)
        .replace(/{{targetmessage}}/gi, fullMessage)
        .replace(/{{rewritecount}}/gi, wordCount);

    // Inject custom instructions if applicable
    if (action.askForInstructions) {
        if (prompt.includes('{{custom_instructions}}')) {
            prompt = prompt.replace(/{{custom_instructions}}/gi, customInstructions);
        } else {
            // Append if macro is missing (basic fallback)
            prompt += `\n\nInstructions: ${customInstructions}`;
        }
    }

    // Create a simplified chat format
    const simplifiedChat = [
        {
            role: "system",
            content: prompt
        }
    ];

    // Create a new AbortController
    abortController = new AbortController();

    const prev_oai_settings = Object.assign({}, oai_settings);
    oai_settings.openai_max_tokens = calculateTargetTokenCount(selectedRawText, action);
    oai_settings.stream_openai = extension_settings[extensionName].useStreaming;

    // Store the necessary data in the signal
    abortController.signal.prev_oai_settings = prev_oai_settings;
    abortController.signal.mesDiv = mesDiv;
    abortController.signal.mesId = mesId;
    abortController.signal.swipeId = swipeId;
    abortController.signal.highlightDuration = extension_settings[extensionName].highlightDuration;

    // Show the stop button
    getContext().deactivateSendButtons();

    let res;
    try {
        res = await sendOpenAIRequest('normal', simplifiedChat, abortController.signal);
    } catch (error) {
        console.error('[Rewrite Extension] Error during simplified OpenAI rewrite:', error);
        toastr.error('Rewrite failed. Check browser console (F12) for details.', 'Rewrite Error');
        getContext().activateSendButtons();
        return;
    } finally {
        window.getSelection().removeAllRanges();
        Object.assign(oai_settings, prev_oai_settings);
    }

    if (res === undefined) {
        getContext().activateSendButtons();
        return;
    }

    let newText = '';
    try {
        if (typeof res === 'function') {
            // Streaming case
            const streamingSpan = document.createElement('span');
            streamingSpan.className = 'animated-highlight';

            // Replace the selected text with the streaming span
            range.deleteContents();
            range.insertNode(streamingSpan);

            for await (const chunk of res()) {
                newText = chunk.text;
                streamingSpan.textContent = newText;
            }
        } else {
            // Non-streaming case
            newText = res?.choices?.[0]?.message?.content ?? '';
            const highlightedNewText = document.createElement('span');
            highlightedNewText.className = 'animated-highlight';
            highlightedNewText.textContent = newText;

            range.deleteContents();
            range.insertNode(highlightedNewText);
        }

        // Remove highlight after x seconds when streaming is complete
        const highlightDuration = extension_settings[extensionName].highlightDuration;
        setTimeout(() => removeHighlight(mesDiv, mesId, swipeId), highlightDuration);

        await saveRewrittenText(mesId, swipeId, fullMessage, rawStartOffset, rawEndOffset, newText);
    } finally {
        getContext().activateSendButtons();
    }
}

async function handleTextBasedRewrite(mesId, swipeId, action, customInstructions, selectionInfo) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText, rawStartOffset, rawEndOffset, range } = selectionInfo;
    const mesDiv = document.querySelector(`[mesid="${mesId}"] .mes_text`); // Keep getting mesDiv for highlight/DOM ops
    if (!mesDiv) { // Add check for mesDiv existence
        console.error("[Rewrite Extension] Could not find mesDiv in handleTextBasedRewrite.");
        return;
    }
    const promptTemplate = action.prompt;

    // Get amount of words
    const wordCount = extractAllWords(selectedRawText).length;

    // Replace macros in the prompt template
    let prompt = getContext().substituteParams(promptTemplate);

    prompt = prompt
        .replace(/{{rewrite}}/gi, selectedRawText)
        .replace(/{{targetmessage}}/gi, fullMessage)
        .replace(/{{rewritecount}}/gi, wordCount);

    // Inject custom instructions if applicable
    if (action.askForInstructions) {
        if (prompt.includes('{{custom_instructions}}')) {
            prompt = prompt.replace(/{{custom_instructions}}/gi, customInstructions);
        } else {
            // Append if macro is missing (basic fallback)
            prompt += `\n\nInstructions: ${customInstructions}`;
        }
    }

    let generateData;
    const amount_gen = calculateTargetTokenCount(selectedRawText, action);

    // Prepare generation data based on the selected model
    switch (main_api) {
        case 'novel':
            const novelSettings = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
            generateData = getNovelGenerationData(prompt, novelSettings, amount_gen, false, false, null, 'quiet');
            break;
        case 'textgenerationwebui':
            generateData = getTextGenGenerationData(prompt, amount_gen, false, false, null, 'quiet');
            break;
        case 'koboldhorde':
            if (action.askForInstructions) {
                // For Custom Horde, use the manually constructed prompt directly
                // We need a basic structure for generateHorde, mimicking what getContext().generate would provide
                generateData = {
                    prompt: prompt, // Use the manually constructed prompt
                    max_length: Math.max(amount_gen, MIN_LENGTH),
                    // Include other necessary default parameters if generateHorde requires them
                    // Based on generateHorde usage, 'quiet' and potentially others might be needed.
                    quiet: true, // Often used in background generation
                };
            } else {
                // Existing logic for non-custom Horde rewrites
                const promptReadyPromise = new Promise(resolve => {
                    eventSource.once(event_types.GENERATE_AFTER_DATA, resolve);
                });
                getContext().generate('normal', {}, true); // Trigger standard prompt generation
                generateData = await promptReadyPromise; // Wait for the generated data
                generateData.max_length = Math.max(amount_gen, MIN_LENGTH);
            }
            break;
        // Add more cases for other text-based models as needed
        default:
            toastr.error('Unsupported model:', main_api);
            return;
    }

    // Create a new AbortController
    abortController = new AbortController();

    // Store the necessary data in the signal
    abortController.signal.mesDiv = mesDiv;
    abortController.signal.mesId = mesId;
    abortController.signal.swipeId = swipeId;
    abortController.signal.highlightDuration = extension_settings[extensionName].highlightDuration;

    // Show the stop button
    getContext().deactivateSendButtons();
    let res;
    if (extension_settings[extensionName].useStreaming) {
        switch (main_api) {
            case 'textgenerationwebui':
                res = await generateTextGenWithStreaming(generateData, abortController.signal);
                break;
            case 'novel':
                res = await generateNovelWithStreaming(generateData, abortController.signal);
                break;
            case 'koboldhorde':
                toastr.warning('Rewrite streaming not supported for Kobold. Turn off in rewrite settings.');
            default:
                throw new Error('Streaming is enabled, but the current API does not support streaming.');
        }
    } else {
        if (main_api === 'koboldhorde') {
            res = await generateHorde(prompt, generateData, abortController.signal, true);
        } else {
            const response = await generateRaw(prompt, null, false, false, null, generateData.max_length);
            res = {text: response};
            // Shamelessly copied from script.js
            /*function getGenerateUrl(api) {
                switch (api) {
                    case 'textgenerationwebui':
                        return '/api/backends/text-completions/generate';
                    case 'novel':
                        return '/api/novelai/generate';
                    default:
                        throw new Error(`Unknown API: ${api}`);
                }
            }

            const response = await fetch(getGenerateUrl(main_api), {
                method: 'POST',
                headers: getRequestHeaders(),
                cache: 'no-cache',
                body: JSON.stringify(generateData),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const error = await response.json();
                throw error;
            }

            res = await response.json();*/
        }
    }

    window.getSelection().removeAllRanges();

    let newText = '';

    if (typeof res === 'function') {
        // Streaming case

        const streamingSpan = document.createElement('span');
        streamingSpan.className = 'animated-highlight';

        // Replace the selected text with the streaming span
        range.deleteContents();
        range.insertNode(streamingSpan);

        for await (const chunk of res()) {
            newText = chunk.text;
            streamingSpan.textContent = newText;
        }
    } else {
        // Non-streaming case
        newText = res?.choices?.[0]?.message?.content ?? res?.choices?.[0]?.text ?? res?.text ?? '';
        if (main_api === 'novel') newText = res.output;
        const highlightedNewText = document.createElement('span');
        highlightedNewText.className = 'animated-highlight';
        highlightedNewText.textContent = newText;

        range.deleteContents();
        range.insertNode(highlightedNewText);
    }

    // Remove highlight after x seconds when streaming is complete
    const highlightDuration = extension_settings[extensionName].highlightDuration;
    setTimeout(() => removeHighlight(mesDiv, mesId, swipeId), highlightDuration);

    await saveRewrittenText(mesId, swipeId, fullMessage, rawStartOffset, rawEndOffset, newText);
    getContext().activateSendButtons();
}

function calculateTargetTokenCount(selectedText, action) {
    const baseTokenCount = getTokenCount(selectedText);
    const useDynamicTokens = extension_settings[extensionName].useDynamicTokens;
    const dynamicTokenMode = extension_settings[extensionName].dynamicTokenMode;
    let result;

    if (Number.isFinite(action.tokenMultiplierOverride)) {
        result = baseTokenCount * action.tokenMultiplierOverride;
    } else if (useDynamicTokens) {
        if (dynamicTokenMode === 'additive') {
            result = baseTokenCount + action.tokensAdd;
        } else { // multiplicative
            result = baseTokenCount * action.tokensMult;
        }
    } else {
        result = action.tokens;
    }

    return Math.max(1, Math.round(result)); // Ensure at least 1 token and round to nearest integer
}

async function handleUndo(event) {
    const mesId = event.target.dataset.mesId;
    const change = changeHistory.findLast(change => change.mesId === mesId);

    if (change) {
        const context = getContext();
        const messageDiv = document.querySelector(`[mesid="${mesId}"]`);

        if (!messageDiv || !context.chat[mesId]) {
            console.error('Message not found for undo operation');
            return;
        }

        // Update the chat context
        context.chat[mesId].mes = change.originalContent;

        // Only update swipes if they exist
        if (change.swipeId !== undefined && context.chat[mesId].swipes) {
            context.chat[mesId].swipes[change.swipeId] = change.originalContent;
        }

        // Update the UI
        const mesTextElement = messageDiv.querySelector('.mes_text');
        if (mesTextElement) {
            mesTextElement.innerHTML = messageFormatting(
                change.originalContent,
                context.name2,
                context.chat[mesId].isSystem,
                context.chat[mesId].isUser,
                mesId
            );
            addCopyToCodeBlocks(mesTextElement);
        }

        // Save the chat
        await context.saveChat();

        // Remove this change from history
        changeHistory = changeHistory.filter(c => c !== change);

        // Update undo buttons
        updateUndoButtons();
    }
}

async function saveRewrittenText(mesId, swipeId, fullMessage, startOffset, endOffset, newText) {
    const context = getContext();

    // Get the prefix and suffix to remove from the settings
    const removePrefix = extension_settings[extensionName].removePrefix || '';
    const removeSuffix = extension_settings[extensionName].removeSuffix || '';

    // Remove prefix if present
    if (removePrefix && newText.startsWith(removePrefix)) {
        newText = newText.slice(removePrefix.length);
    }

    // Remove suffix if present
    if (removeSuffix && newText.endsWith(removeSuffix)) {
        newText = newText.slice(0, -removeSuffix.length);
    }

    // Apply AI Output regex scripts if setting is enabled
    let processedText = newText; // Default to original newText
    if (extension_settings[extensionName].applyRegexOnRewrite) {
        processedText = getRegexedString(newText, regex_placement.AI_OUTPUT);
    }

    // Create the new message with the rewritten and potentially processed section
    const newMessage =
        fullMessage.substring(0, startOffset) +
        processedText + // Use the processed text here
        fullMessage.substring(endOffset);

    // Save the change to the history
    saveLastChange(mesId, swipeId, fullMessage, newMessage);

    // Update the main message
    context.chat[mesId].mes = newMessage;

    // Update the swipe if it exists
    if (swipeId !== undefined && context.chat[mesId].swipes && context.chat[mesId].swipes[swipeId]) {
        context.chat[mesId].swipes[swipeId] = newMessage;
    }

    // Save and reload the chat
    await context.saveChat();
}
