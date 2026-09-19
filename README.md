# Rewrite Extension for SillyTavern

> [!IMPORTANT]
> **2025.09.02** - This is extension is no longer maintained for the foreseeable future.

## Overview

The Rewrite Extension enhances the chat experience in SillyTavern by allowing users to dynamically rewrite, shorten, or expand selected text within messages. Works for chat completion, text completion and NovelAI.

## Features

- Custom {{rewrite}} macro that contains the selected text
- Custom {{targetmessage}} macro that contains the full targeted message
- Custom {{rewritecount}} macro that returns a numeric (39) count of words selected
- Configurable selection-menu buttons with custom names, order, prompts, presets, token limits, and visibility
- Optional per-button custom-instruction prompt and delete-selection behavior
- Convenient undo button
- Real-time streaming of rewritten text
- Temporary highlighting of modified text for easy identification
- Ability to abort ongoing rewrites

## Installation

Use SillyTavern's built-in extension installer:
`https://github.com/splitclover/rewrite-extension`

## Usage

To use the Rewrite Extension:

1. Configure the extension (see below)
2. Select text within a single(!) chat message
3. A context menu will appear with your configured rewrite actions
4. Choose the desired option
5. The selected text will be replaced with the AI-generated modification

## Configuration

1. Open the Extension tab -> Rewrite Extension
2. Configure, rename, reorder, or add buttons under Rewrite Buttons
3. Choose a Chat Completion preset or Text Completion prompt and token behavior for each generated-text button
4. Adjust shared options such as streaming, output regex, and highlight duration

Existing Rewrite, Shorten, Expand, Custom, and Delete settings are migrated automatically the first time this version loads. The legacy settings remain stored as a rollback-safe backup.

## Contributing

Contributions to improve the Rewrite Extension are welcome. Please fork the repository and submit a pull request with your changes.
