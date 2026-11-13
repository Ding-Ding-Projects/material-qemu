# Material QEMU development

The initial application is a Node.js HTTP service with a browser client and QEMU runtime. `server/` owns authentication, serialized storage and host processes. `public/` owns browser presentation and interaction. The preserved `design/` tree is reference material, not proof of implementation.

Use root `build.bat /s --container` for the Windows container build and `npm test` for focused local verification. No tests or lint run in CI. Never change or delete existing VM data while rebuilding. All process arguments remain server-owned; never accept shell commands or arbitrary QMP from a browser.

## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.
