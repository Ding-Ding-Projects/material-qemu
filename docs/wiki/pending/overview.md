# Measured Overview history

The backend samples resource counters every two seconds and retains at most ninety actual samples in memory. CPU history is based on the logical CPU counters visible to the runtime, not per-machine or guest CPU usage. Memory is labelled as container usage when cgroup accounting is available, otherwise as host-visible usage; the displayed capacity is the runtime's detected limit or visible host capacity.

Charts use recorded timestamps and values only. They remain absent until at least two valid samples exist. Missing CPU values are omitted, and sampling failures retain prior readings with a visible last-known warning instead of adding fabricated replacements. The ring resets when the service restarts.

Overview state and architecture filters are independent from the Machines search/filter state and persist in account settings. Clearing an empty combination restores both Overview filters without changing machine records. Disk/network throughput and guest metrics remain explicitly unavailable.

Operational captures containing host-specific resource values remain private unless separately reviewed for publication.
