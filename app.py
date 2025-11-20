import streamlit as st
import pdfplumber
import json
import re

# Optional SDK imports
try:
    import google.generativeai as genai
except ImportError:
    genai = None

try:
    import openai
except ImportError:
    openai = None


# --- Prompt Templates ---


BUSINESS_PROCESS_PROMPT = """
You are a knowledgeable analyst. From the functional specification below, extract the **top 10 key business processes** described in the document.

For each business process:

- Provide a sequentially numbered title.
- Explain the trigger condition.
- Describe the detailed system process flow clearly and comprehensively.

Return the response as a **human-readable markdown text** (not JSON), formatted similarly to the example below:

Business Processes
These are the high-level operational flows described in the document.

1. Customer Onboarding  
Trigger: When a new customer registers with the system.  
Process:  
- The system validates customer details.  
- The system creates an account and sends confirmation.  
(Continue similarly for each business process)

Only output the markdown formatted description. Do NOT include JSON.

Functional Specification:
{document}
""".strip()


TEST_SCENARIOS_PROMPT = """
You are a software testing expert. Given the functional specification and business processes below, generate **10 detailed test scenarios** that cover the entire system logically and comprehensively.

Return the test scenarios as a **JSON array** with each object containing:
- id: unique integer
- name: scenario title
- description: detailed explanation of the test scenario

Make sure the scenarios capture major functional areas such as eligibility, fees, rewards, cancellations, wallets, interfaces, workflows, etc.

Return ONLY valid JSON, no extra text or markdown.

Functional Specification and Business Processes:
{document}
""".strip()


TEST_CASES_PROMPT = """
You are a senior testing expert. Given the functional specification and business processes below, and the following test scenarios, generate detailed **unit and system test cases** for each scenario.

For each test case, include:
- id: unique integer
- title: descriptive test case title
- description: detailed explanation of what the test verifies
- preconditions: list of preconditions
- steps: ordered steps to execute test
- expectedResult: expected outcome of the test

Return the full output as JSON structured exactly as follows, with no extra text or markdown:

{{
  "testCases": [
    {{
      "scenarioId": 1,
      "scenarioName": "Scenario Name",
      "unitTestCases": [
        {{
          "id": 1,
          "title": "Test Case Title",
          "description": "Detailed description",
          "preconditions": "Preconditions",
          "steps": ["Step 1", "Step 2"],
          "expectedResult": "Expected outcome"
        }}
      ],
      "systemTestCases": [
        {{
          "id": 1,
          "title": "System Test Case Title",
          "description": "Detailed description",
          "preconditions": "Preconditions",
          "steps": ["Step 1", "Step 2"],
          "expectedResult": "Expected outcome"
        }}
      ]
    }}
  ]
}}

Functional Specification and Business Processes:
{document}

Test Scenarios:
{scenarios}
""".strip()


# --- Utility functions ---


def extract_json(text: str):
    """Extract JSON enclosed in triple backticks (``````) or fallback."""
    pattern = r"``````"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # fallback: try to find first { or [ and parse heuristically:
    json_start = min(
        [idx for idx in (text.find('{'), text.find('[')) if idx != -1],
        default=-1
    )
    if json_start >= 0:
        possible_json = text[json_start:].strip()
        for end_index in range(len(possible_json), 0, -1):
            candidate = possible_json[:end_index]
            try:
                json.loads(candidate)
                return candidate
            except Exception:
                continue
    return text.strip()


def safe_load_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        return None


# --- LLM API wrappers ---


def call_gemini(api_key: str, prompt: str) -> str:
    if genai is None:
        raise ImportError("google.generativeai not installed. Run `pip install google-generativeai`.")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("models/gemini-1.5-flash")
    response = model.generate_content(prompt)
    return response.text


def call_openai(api_key: str, prompt: str) -> str:
    if openai is None:
        raise ImportError("openai not installed. Run `pip install openai`.")
    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert assistant for analyzing functional specifications."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=4000,
        temperature=0.3,
    )
    return response.choices[0].message.content


def call_llm(model_name: str, api_key: str, prompt: str) -> str:
    if model_name == "Google Gemini":
        return call_gemini(api_key, prompt)
    elif model_name == "OpenAI GPT-4":
        return call_openai(api_key, prompt)
    else:
        raise ValueError("Unknown model selected")


# --- Display functions ---


def display_business_process_markdown(text):
    st.markdown("## Business Processes")
    st.markdown(text)


def display_test_scenarios(scenarios):
    st.markdown("## Test Scenarios")
    for scenario in scenarios:
        st.markdown(f"### {scenario.get('id', '?')}. {scenario.get('name', '')}")
        st.write(scenario.get("description", ""))


def display_test_cases(data):
    st.markdown("## Test Cases")
    for scenario in data.get("testCases", []):
        st.markdown(f"### Scenario {scenario.get('scenarioId', '?')}: {scenario.get('scenarioName', '')}")
        if scenario.get("unitTestCases"):
            st.markdown("#### Unit Test Cases")
            for uc in scenario["unitTestCases"]:
                st.markdown(f"**{uc.get('id', '?')}. {uc.get('title', '')}**")
                st.write(f"Description: {uc.get('description', '')}")
                st.write(f"Preconditions: {uc.get('preconditions', '')}")
                st.write(f"Steps:")
                for idx, step in enumerate(uc.get("steps", []), 1):
                    st.write(f"{idx}. {step}")
                st.write(f"Expected Result: {uc.get('expectedResult', '')}")
                st.markdown("---")
        if scenario.get("systemTestCases"):
            st.markdown("#### System Test Cases")
            for sc in scenario["systemTestCases"]:
                st.markdown(f"**{sc.get('id', '?')}. {sc.get('title', '')}**")
                st.write(f"Description: {sc.get('description', '')}")
                st.write(f"Preconditions: {sc.get('preconditions', '')}")
                st.write(f"Steps:")
                for idx, step in enumerate(sc.get("steps", []), 1):
                    st.write(f"{idx}. {step}")
                st.write(f"Expected Result: {sc.get('expectedResult', '')}")
                st.markdown("---")


# --- Streamlit UI ---


st.set_page_config(page_title="Functional Spec Test Suite Generator", layout="wide")
st.title("Business Process, Test Scenario, and Test Case Generator")

with st.sidebar:
    st.header("Configuration")
    selected_model = st.selectbox("Select LLM Model", ["Google Gemini", "OpenAI GPT-4"])
    if selected_model == "Google Gemini":
        api_key = st.text_input("Google Gemini API Key", type="password", help="Your Gemini API key is NOT stored.")
    else:
        api_key = st.text_input("OpenAI API Key", type="password", help="Your OpenAI API key is NOT stored.")

    st.markdown("---")
    num_test_cases = st.number_input("Number of Test Cases per Scenario", min_value=1, max_value=20, value=5)
    test_case_types = st.multiselect(
        "Test Case Types to Include",
        options=["Unit", "System"],
        default=["Unit", "System"]
    )
    st.markdown("---")
    st.info(
        """
Upload your product manual or functional specification document (PDF or TXT).
Step through the tabs in order:
1. Upload and preview document
2. Extract Business Processes
3. Generate Test Scenarios (uses extracted business processes + document)
4. Generate Test Cases (uses all previous outputs)
"""
    )


tab1, tab2, tab3 = st.tabs(["Upload & Preview", "Business Processes", "Test Scenarios & Cases"])

with tab1:
    st.subheader("Upload Document (PDF or TXT)")
    uploaded_file = st.file_uploader("Upload your product manual or spec document", type=["pdf", "txt"])
    document_text = ""
    if uploaded_file:
        if uploaded_file.type == "application/pdf":
            try:
                with pdfplumber.open(uploaded_file) as pdf:
                    pages = [page.extract_text() for page in pdf.pages if page.extract_text()]
                document_text = "\n".join(pages)
            except Exception as e:
                st.error(f"Error reading PDF: {e}")
        else:
            try:
                document_text = uploaded_file.read().decode("utf-8", errors="ignore")
            except Exception as e:
                st.error(f"Error reading text file: {e}")

    if document_text:
        st.session_state['document_text'] = document_text
        with st.expander("Document Preview"):
            st.text_area("Functional Specification Preview", document_text[:15000], height=400)
    else:
        st.info("Please upload a document to proceed.")


with tab2:
    st.subheader("Business Processes Extraction")
    if st.button("Extract Business Processes"):
        if not api_key:
            st.error("Please enter your API key in the sidebar.")
        elif 'document_text' not in st.session_state or not st.session_state['document_text']:
            st.error("Please upload a document in the 'Upload & Preview' tab.")
        else:
            with st.spinner("Extracting business processes..."):
                try:
                    prompt = BUSINESS_PROCESS_PROMPT.format(document=st.session_state['document_text'])
                    raw_response = call_llm(selected_model, api_key, prompt)
                    st.success("Business processes extracted.")
                    display_business_process_markdown(raw_response)
                    st.session_state['business_process_text'] = raw_response
                except Exception as e:
                    st.error(f"Failed to extract business processes: {e}")

    if 'business_process_text' in st.session_state:
        st.markdown("---")
        st.markdown("### Last Extracted Business Processes")
        display_business_process_markdown(st.session_state['business_process_text'])


with tab3:
    st.subheader("Test Scenarios & Test Cases Generation")

    if st.button("Generate Test Scenarios"):
        if not api_key:
            st.error("Please enter your API key in the sidebar.")
        elif 'document_text' not in st.session_state or not st.session_state['document_text']:
            st.error("Please upload a document in the 'Upload & Preview' tab.")
        elif 'business_process_text' not in st.session_state or not st.session_state['business_process_text']:
            st.error("Please extract business processes in the 'Business Processes' tab first.")
        else:
            with st.spinner("Generating test scenarios..."):
                try:
                    combined_doc = (
                        st.session_state['document_text']
                        + "\n\nBusiness Processes:\n"
                        + st.session_state.get('business_process_text', '')
                    )
                    prompt = TEST_SCENARIOS_PROMPT.format(document=combined_doc)
                    raw_response = call_llm(selected_model, api_key, prompt)
                    json_text = extract_json(raw_response)
                    scenarios = safe_load_json(json_text)
                    if scenarios and isinstance(scenarios, list):
                        st.session_state['test_scenarios'] = scenarios
                        st.success(f"{len(scenarios)} test scenarios generated.")
                        display_test_scenarios(scenarios)
                    else:
                        st.error("No valid test scenarios found.")
                except Exception as e:
                    st.error(f"Failed to generate test scenarios: {e}")

    if 'test_scenarios' in st.session_state:
        st.subheader("Test Scenarios JSON (editable)")
        ts_json = json.dumps(st.session_state['test_scenarios'], indent=2)
        user_input = st.text_area("Edit / Add test scenarios JSON here", ts_json, height=300)

        try:
            edited_scenarios = json.loads(user_input) if user_input.strip() else []
        except Exception as e:
            st.error(f"Invalid JSON: {e}")
            edited_scenarios = []

        if st.button("Generate Test Cases"):
            if not api_key:
                st.error("Please enter your API key in the sidebar.")
            elif not edited_scenarios:
                st.error("Please provide valid test scenarios JSON above.")
            elif 'document_text' not in st.session_state or not st.session_state['document_text']:
                st.error("Please upload a document in the 'Upload & Preview' tab.")
            elif 'business_process_text' not in st.session_state or not st.session_state['business_process_text']:
                st.error("Please extract business processes in the 'Business Processes' tab first.")
            else:
                with st.spinner("Generating test cases..."):
                    try:
                        combined_doc = (
                            st.session_state['document_text']
                            + "\n\nBusiness Processes:\n"
                            + st.session_state.get('business_process_text', '')
                        )
                        prompt = TEST_CASES_PROMPT.format(
                            document=combined_doc,
                            scenarios=json.dumps(edited_scenarios),
                        )
                        raw_response = call_llm(selected_model, api_key, prompt)
                        json_text = extract_json(raw_response)
                        test_cases = safe_load_json(json_text)
                        if test_cases and "testCases" in test_cases:
                            st.session_state['test_cases'] = test_cases
                            st.success(f"{len(test_cases['testCases'])} test cases generated.")
                            display_test_cases(test_cases)
                        else:
                            st.error("No valid test cases found.")
                    except Exception as e:
                        st.error(f"Failed to generate test cases: {e}")

    if 'test_cases' in st.session_state:
        st.markdown("---")
        st.markdown("### Last Generated Test Cases")
        display_test_cases(st.session_state['test_cases'])
