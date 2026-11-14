# Organize machines without changing their storage

## Folders

Create a folder from the machine toolbar, then choose it in the machine editor. The folder manager offers rename and removal on desktop and narrow screens.

Renaming updates the folder, every machine assignment and every saved view that filters that folder in one serialized persistent transaction. Duplicate names, missing folders and invalid names are rejected without partially applying changes.

Removal requires the exact folder name and an explicit choice to keep its machines in Unfiled. It never deletes machines or disks. Saved views that filtered the removed folder switch to all folders, as the confirmation explains. Hardware does not change, so organization can be changed while a machine is running.

## Saved views

A saved view preserves the current text query, status/favourite filter and folder. Its separate Delete control opens a confirmation. Deleting a saved view changes neither machine records nor folders. A stale or unknown view cannot be deleted silently.

## Keyboard and persistence

Dialogs use native modal focus containment and Escape dismissal. Closing a nested folder operation restores focus to the original folder-manager control. Buttons remain at least 48 pixels high, and grouped controls wrap on narrow screens. Enter advances the machine editor without submitting a browser navigation.

Focused tests reload stored state after rename, removal and saved-view deletion; prove retained machine and disk definitions; and reject duplicate names, stale references, invalid confirmation and mixed-operation partial updates. Built browser acceptance is recorded separately in the task evidence.

Needs attention uses real machine errors. Recently used shows machines with recorded activity in the last seven days, newest first. Direct and bulk Move to folder actions update metadata while preserving process state and disk definitions; each bulk result is reported individually.


Source: [docs/features/organization.md](https://github.com/Ding-Ding-Projects/material-qemu/blob/2a273d914f9d4a0c4f61be13d391a9011fc38f42/docs/features/organization.md).
