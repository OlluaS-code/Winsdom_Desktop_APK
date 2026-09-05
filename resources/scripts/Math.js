(function () {
  const mathInput = document.getElementById("math-input");
  const mathOutput = document.getElementById("math-output");
  const togglePlot = document.getElementById("toggle-plot");
  const errorDisplay = document.getElementById("error-display");
  const navButtons = document.querySelectorAll(".nav-btn-tab");
  const views = document.querySelectorAll(".view");
  const plotContainer = document.getElementById("plot-container");

  function initSPA() {
    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetViewId = btn.getAttribute("data-view");

        navButtons.forEach((b) => b.classList.remove("active-tab"));
        btn.classList.add("active-tab");

        views.forEach((v) => {
          v.style.display = "none";
          if (v.id === `view-${targetViewId}`) {
            v.style.display = targetViewId === "calculator" ? "flex" : "block";
          }
        });

        if (targetViewId === "whiteboard" && window.app) {
          window.app.resize();
        }
      });
    });
  }

  if (window.winsdom) {
    window.winsdom.onMenuAction((action) => {
      switch (action) {
        case "insert-latex":
          document.querySelector('.nav-btn-tab[data-view="editor"]').click();
          setTimeout(() => mathInput.focus(), 100);
          break;
        case "open-calc":
          document
            .querySelector('.nav-btn-tab[data-view="calculator"]')
            .click();
          break;
        case "open-spreadsheet":
          alert("Em breve!");
          break;
      }
    });
    window.winsdom.onExportPDF(() => {
      window.print();
    });
  }

  function tryPlot(expressionStr) {
    plotContainer.innerHTML = "";
    if (!togglePlot.checked || !expressionStr.includes("x")) return;
    try {
      let cleanForPlot = expressionStr
        .replace(/\\cdot/g, "*")
        .replace(/\\/g, "")
        .replace(/\{/g, "(")
        .replace(/\}/g, ")");

      functionPlot({
        target: "#plot-container",
        width: plotContainer.offsetWidth || 500,
        height: 350,
        grid: true,
        data: [
          {
            fn: cleanForPlot,
            sampler: "builtIn",
            graphType: "polyline",
          },
        ],
      });
    } catch (e) {}
  }

  function processMath() {
    const inputVal = mathInput.value.trim();
    errorDisplay.textContent = "";
    if (!inputVal) {
      mathOutput.innerHTML = "";
      plotContainer.innerHTML = "";
      return;
    }
    if (typeof Algebrite === "undefined") {
      return;
    }
    try {
      let displayTex = "";
      let plotExpression = "";
      let resultValue = null;

      if (inputVal.toLowerCase().startsWith("integral")) {
        let innerText = inputVal.match(/\((.+)\)/)
          ? inputVal.match(/\((.+)\)/)[1]
          : inputVal.replace(/integral/i, "").trim();
        let resultAlgebrite = Algebrite.integral(innerText).toString();
        const inputNode = math.parse(innerText);
        const resultNode = math.parse(resultAlgebrite);
        displayTex = `\\int (${inputNode.toTex()}) \\, dx = ${resultNode.toTex()} + C`;
        plotExpression = resultNode.toString();
      } else if (inputVal.toLowerCase().includes("derivative")) {
        let node = math.parse(inputVal);
        let derived = math.derivative(node.args[0], node.args[1] || "x");
        displayTex = derived.toTex();
        plotExpression = derived.toString();
      } else {
        const safeCalc = new window.SafeCalculator();
        const sanitized = safeCalc.normalizeExpression(inputVal);
        const node = math.parse(sanitized);
        
        // Proteção de segurança (bloqueia variáveis maliciosas/atribuições)
        node.traverse((n) => {
          if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode') {
            throw new Error('Operação de atribuição não permitida na calculadora padrão.');
          }
        });

        plotExpression = node.toString();

        try {
          const evaluated = node.evaluate();
          if (typeof evaluated === "number") {
            resultValue = math.format(evaluated, { precision: 5 });
          }
        } catch (e) {}
        displayTex = node.toTex();
      }

      let html = `\\[ ${displayTex} \\]`;
      if (resultValue) {
        html += `<div class="result-box" style="text-align:center; margin-top:15px; border-top:1px solid #e2e8f0; padding-top:10px;">
                        <span style="color:#94a3b8; font-size:0.8em; font-weight:bold;">VALOR:</span><br>
                        \\[ ${resultValue} \\]
                       </div>`;
      }
      mathOutput.innerHTML = html;
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([mathOutput]).catch(() => {});
      }
      if (plotExpression) tryPlot(plotExpression);
    } catch (err) {
      errorDisplay.textContent = "Erro: " + err.message;
      mathOutput.innerHTML = `\\[ \\text{...} \\]`;
    }
  }

  const runProcess = ((fn, ms) => {
    let timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };
  })(processMath, 400);

  mathInput.addEventListener("input", runProcess);
  togglePlot.addEventListener("change", runProcess);

  document.addEventListener("DOMContentLoaded", function () {
    const display = document.getElementById("calc-display");
    const grid = document.querySelector(".buttons-grid");
    let currentValue = "";

    const safeCalc = new window.SafeCalculator();
    function evaluateResult() {
      try {
        if (currentValue.trim() === "") return;
        // O SafeCalculator já trata ×, ÷, %, ^, π internamente
        const res = safeCalc.evaluate(currentValue);
        if (res.success) {
          currentValue = res.result;
          display.value = currentValue;
        } else {
          display.value = "Erro";
          currentValue = "";
        }
      } catch (error) {
        display.value = "Erro";
        currentValue = "";
      }
    }

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const val = btn.innerText.trim();

      if (val === "AC") {
        currentValue = "";
        display.value = "0";
      } else if (val === "DEL") {
        currentValue = currentValue.slice(0, -1);
        display.value = currentValue || "0";
      } else if (val === "=") {
        evaluateResult();
      } else {
        const scientificFunctions = ["sin", "cos", "tan", "log", "ln", "√"];
        currentValue += scientificFunctions.includes(val) ? val + "(" : val;
        display.value = currentValue;
      }
    });
  });

  initSPA();
  if (window.lucide) window.lucide.createIcons();
})();
