#!/bin/sh



echo "Replacing environment variables in the source code..."

# Check if the directory parameter is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <directory>"
    exit 1
fi

# Assign the first argument to the directory variable
directory="$1"

# Define an array with key-value pairs
vars="
API_URL:
"

# Loop over the array and replace each placeholder with its corresponding env var
echo "$vars" | while IFS=: read -r key value; do
    # Escape forward slashes in the value
    escaped_value=$(printf '%s\n' "$value" | sed 's/[\/&]/\\&/g')
    find "$directory" -name '*.ts' -print -exec sed -i -e "s,\${$key},$escaped_value,g" {} \;
done
