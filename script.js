let pyodide;
let codeEditor;
let ellipsisInterval;
let initEllipsisInterval;
// Add this function to animate the ellipsis
function animateEllipsis() {
    const ellipsis = document.getElementById("ellipsis");
    const dots = ellipsis.innerHTML.length;
    if (dots < 3) {
        ellipsis.innerHTML += ".";
    } else {
        ellipsis.innerHTML = "";
    }
}

function animateInitEllipsis() {
    const initEllipsis = document.getElementById("init-ellipsis");
    const dots = initEllipsis.innerHTML.length;
    if (dots < 3) {
        initEllipsis.innerHTML += ".";
    } else {
        initEllipsis.innerHTML = "";
    }
}

function createEmptyWhiteBlock() {
    const emptyBlock = document.createElement("div");
    emptyBlock.style.cssText = "left: 0; top: 0; z-index: 0; outline: 0; width: 640.0px; height: 480.0px; background-color: white;";
    emptyBlock.id = "empty-white-block";
    return emptyBlock;
}
// Update the showLoadingOverlay function to add the empty white block
function showLoadingOverlay() {
    document.getElementById("loading-overlay").classList.remove("hidden");
    const plotContainer = document.getElementById("plot-container");
    plotContainer.appendChild(createEmptyWhiteBlock());
    ellipsisInterval = setInterval(animateEllipsis, 500);
}
// Update the hideLoadingOverlay function to remove the empty white block
function hideLoadingOverlay() {
    document.getElementById("loading-overlay").classList.add("hidden");
    const plotContainer = document.getElementById("plot-container");
    const emptyBlock = document.getElementById("empty-white-block");
    if (emptyBlock) {
        plotContainer.removeChild(emptyBlock);
    }
    clearInterval(ellipsisInterval);
}
async function main() {
    initEllipsisInterval = setInterval(animateInitEllipsis, 500);
    pyodide = await loadPyodide();
    console.log(
        pyodide.runPython(`
        import sys
        sys.version
    `)
    );
    await pyodide.loadPackage("matplotlib");
    codeEditor = CodeMirror(document.getElementById("python-code"), {
        mode: "python",
        lineNumbers: true,
        indentUnit: 4,
        smartIndent: true,
        tabSize: 4,
        theme: "default",
        viewportMargin: Infinity,
        lineWrapping: true,
    });
    codeEditor.setSize("600px", "400px");
    codeEditor.setValue("import matplotlib\nimport numpy as np\nmatplotlib.use(\"module://matplotlib_pyodide.html5_canvas_backend\")\nimport matplotlib.cm as cm\nfrom matplotlib import pyplot as plt\nfig = plt.figure()\n\n#Write your plotting code here. Do not remove the first 6 lines above or the command below.\n\nplt.show()");
    // Set the API key input value from localStorage
    const apiKeyInput = document.getElementById("api-key");
    apiKeyInput.value = localStorage.getItem("apiKey") || "";
    // Set the input type to "password" if the API key is present
    if (apiKeyInput.value.length > 0) {
        apiKeyInput.type = "password";
    }
    // Update localStorage when the API key input value changes
    apiKeyInput.addEventListener("input", () => {
        localStorage.setItem("apiKey", apiKeyInput.value);
    });
    // Remove the "hidden" class from the content div
    document.getElementById("content").classList.remove("hidden");
    document.getElementById("code-and-error-container").classList.remove("hidden");
    // Hide the loading div
    //document.getElementById("loading-init").style.display = "none";
    document.getElementById("loading-init").style.display = "none";
    // Stop animating the init ellipsis
    clearInterval(initEllipsisInterval);
    codeEditor.refresh();
}
async function runPythonCode() {
    document.getElementById("explanation").innerHTML = "";
    document.getElementById("python-error").innerHTML = "";
    document.getElementById("plot-container").innerHTML = "";
    const apiKey = document.getElementById("api-key").value;
    if (!apiKey || apiKey.trim() === "") {
        alert("Please enter an API key before pressing GO.");
        return;
    }
    showLoadingOverlay();
    const chatbotQuestion = document.getElementById("chatbot-question").value;
    const pythonCode = codeEditor.getValue();
    let newCode = pythonCode;
    if (chatbotQuestion) {
        try {
            const {
                newCode: code,
                explanation
            } = await getNewCodeFromChatbot(apiKey, chatbotQuestion, pythonCode);
            newCode = code;
            if (newCode && newCode.trim() !== "") {
                codeEditor.setValue(newCode);
            }
            document.getElementById("explanation").innerHTML = `<b>GPT says:</b><br>${explanation}`;
        } catch (error) {
            console.error("GPT API Error:", error);
            alert(`GPT API Error: ${error}\nWaiting a few seconds usually fixes most errors.`);
        }
    }
    await executePythonCode(newCode);
    document.getElementById("chatbot-question").value = "";
}

function formatErrorMessage(errorMessage) {
    return `<b><span style="font-size: larger; color: red;">Running the Python code resulted in the following error:</span></b><br><span style="color: black;">${errorMessage}</span>`;
}
async function getNewCodeFromChatbot(apiKey, chatbotQuestion, pythonCode) {
    console.log("Making API call...");
    console.log("API key:", apiKey);
    console.log("Command:", `Command: ${chatbotQuestion}\n\nCurrent Code:\n${pythonCode}`);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "gpt-3.5-turbo",
            "messages": [{
                    "role": "system",
                    "content": "You are an assistant for programming matplotlib plots. \n \
      The user will send you their current program and a request to modify it in some way by either adding, removing, or changing elements in the plot. \n \
      Your output program should be based on the input code. \n \
      You should only output percisely one python program. \n \
      The program should always start with: import matplotlib\nimport numpy as np\nmatplotlib.use(\"module://matplotlib_pyodide.html5_canvas_backend\")\nimport matplotlib.cm as cm\nfrom matplotlib import pyplot as plt\nfig = plt.figure() \n \
      The program should always end with: plt.show() \n \
      The system should return back the program and should return an explanation of what it did. \n \
      The code should have ```python written in the line before it and ``` written in the line after. \n \
      The explanation should have ### right before it. \n \
      So the precise format MUST be ```python \n CODE_HERE \n``` \n ### \n EXPLANATION HERE"
                },
                {
                    "role": "user",
                    "content": `Command: ${chatbotQuestion}\n\nCurrent Code:\n${pythonCode}`
                }
            ]
        })
    });
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}. Wait a few seconds and then try again.`);
    }
    const data = await response.json();
    const message = data.choices[0].message.content;
    const codeMatch = message.match(/```python([\s\S]*?)```/);
    const explanationMatch = message.match(/###([\s\S]*)/);
    const newCode = codeMatch ? codeMatch[1].trim() : "";
    const explanation = explanationMatch ? explanationMatch[1].trim() : "";
    console.log("API call returned:", message);
    return {
        newCode,
        explanation
    };
}
async function fixErrorAutomatically() {
    const pythonErrorElement = document.getElementById("python-error");
    const pythonError = pythonErrorElement.textContent.replace("Running the Python code resulted in the following error:", "").trim();
    const chatbotQuestion = `This code returned the following exception:\n${pythonError}\n`;
    document.getElementById("chatbot-question").value = chatbotQuestion;
    showLoadingOverlay();
    const {
        newCode,
        explanation
    } = await getNewCodeFromChatbot(document.getElementById("api-key").value, chatbotQuestion, codeEditor.getValue());
    if (newCode && newCode.trim() !== "") {
        codeEditor.setValue(newCode);
    }
    await executePythonCode(newCode);
    // Show the explanation after fixing the bug
    document.getElementById("explanation").innerHTML = `<b>GPT says:</b><br>${explanation}`;
    // Clear the exception text and the text in the chatbot-question textbox
    document.getElementById("python-error").innerHTML = "";
    document.getElementById("chatbot-question").value = "";
    hideLoadingOverlay();
}
async function executePythonCode(newCode) {
    const plotContainer = document.getElementById("plot-container");
    let errorOccurred = false;
    try {
        if (newCode && newCode.trim() !== "") {
            pyodide.runPython("globals().clear()");
            pyodide.runPython(newCode);
            const plot = pyodide.runPython("plt.gcf().canvas.get_element('canvas')");
            if (plot instanceof Node) {
                plotContainer.innerHTML = "";
                plotContainer.appendChild(plot);
            } else {
                console.error("Plot is not a valid DOM node:", plot);
            }
        }
    } catch (error) {
        const errorMessage = formatErrorMessage(error.message);
        document.getElementById("python-error").innerHTML = errorMessage;
        document.getElementById("fix-error").classList.remove("hidden");
        errorOccurred = true;
    } finally {
        hideLoadingOverlay();
    }
    if (!errorOccurred) {
        document.getElementById("fix-error").classList.add("hidden");
    }
}
main();
document.getElementById("run-code").addEventListener("click", runPythonCode);
document.getElementById("fix-error").addEventListener("click", fixErrorAutomatically);