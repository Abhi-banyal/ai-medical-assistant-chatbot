import json

# Load dataset once
with open("data/sample_conversations.json") as f:
    dataset = json.load(f)


def retrieve_case(user_message: str):
    user_message = user_message.lower()

    for case in dataset:
        if case["category"] in user_message:
            return case

    return None