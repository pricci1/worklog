# Bump version in package.json and SKILL.md frontmatter, then commit and tag.
# Replicates `bun pm version` but updates both files in one commit (no amend).
# Usage: just version          (defaults to patch)
#        just version minor
#        just version major
#        just version 1.2.3
version increment="patch":
    #!/usr/bin/env bash
    set -euo pipefail

    SKILL_FILE=".agents/skills/managing-worklog/SKILL.md"

    # Require a clean working tree (same as bun pm version)
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "ERROR: Git working directory not clean." >&2
        exit 1
    fi

    CURRENT=$(jq -r .version package.json)

    # Compute the new version
    case "{{increment}}" in
        patch)
            IFS=. read major minor patch <<< "$CURRENT"
            NEW_VERSION="$major.$minor.$((patch + 1))"
            ;;
        minor)
            IFS=. read major minor patch <<< "$CURRENT"
            NEW_VERSION="$major.$((minor + 1)).0"
            ;;
        major)
            IFS=. read major minor patch <<< "$CURRENT"
            NEW_VERSION="$((major + 1)).0.0"
            ;;
        *)
            NEW_VERSION="{{increment}}"
            ;;
    esac

    # Update package.json
    jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp
    mv package.json.tmp package.json

    # Update metadata.version in SKILL.md frontmatter
    sed -i "s/^  version: .*/  version: $NEW_VERSION/" "$SKILL_FILE"
    if ! grep -q "^  version: $NEW_VERSION$" "$SKILL_FILE"; then
        echo "ERROR: Failed to update version in $SKILL_FILE" >&2
        exit 1
    fi

    # Commit both files and create annotated tag
    git add package.json "$SKILL_FILE"
    git commit -m "v$NEW_VERSION"
    git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"

    echo "Bumped to $NEW_VERSION — package.json and $SKILL_FILE updated, committed, and tagged."
