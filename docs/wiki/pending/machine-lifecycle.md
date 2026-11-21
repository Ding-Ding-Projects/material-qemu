# Remove machine records without deleting disks

Remove machine requires its exact name and an explicit retained-disk confirmation. Only a stopped machine can be removed. The service archives the complete definition and removes it from the active workspace in one persistent transaction; it never unlinks the disk. Bulk removal lists the selected machines and reports each outcome independently, so running or paused machines remain active rather than being force-stopped.

Removed machines opens the retained-definition inventory. Restore checks that the original managed disk is still available, returns the definition as a stopped machine and preserves its identity. If its old folder no longer exists, it returns to Unfiled. Permanent disk deletion is not exposed.

Bulk graceful shutdown sends the same real ACPI request as the individual control. A request is not a guarantee that a guest operating system handled it, and each outcome remains explicit.

Tags can be changed while a machine runs and participate in machine search. At most sixteen unique printable tags are accepted, each up to thirty-two Unicode code points. Folder groups persist their collapsed state; rename updates that state and removal clears only the removed folder's entry. The direct and bulk Move controls provide the keyboard/touch alternative to drag-and-drop.

The real HTTP/QEMU regression rejects removal while running, checks confirmation, compares retained disk bytes before and after removal/restoration and verifies the restored process remains stopped. Unit tests cover archive reload, rejected removal, tags and collapsed-folder changes.
