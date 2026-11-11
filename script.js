document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('solver-form');
  const input = document.getElementById('problem-input');
  const clearButton = document.getElementById('clear-btn');
  const errorBox = document.getElementById('error-message');
  const emptyState = document.getElementById('empty-state');
  const resultContent = document.getElementById('result-content');
  const problemOutput = document.getElementById('solved-problem');
  const answerOutput = document.getElementById('answer-value');
  const stepsOutput = document.getElementById('steps-list');
  const copyButton = document.getElementById('copy-btn');
  let plainSolution = '';

  const cleanNumber = (value) => {
    if (!Number.isFinite(value)) throw new Error('계산할 수 없는 값이 있어요. 0으로 나누지 않았는지 확인해 주세요.');
    const rounded = Math.abs(value) < 1e-10 ? 0 : Math.round(value * 1e10) / 1e10;
    return String(rounded);
  };

  function tokenize(source) {
    const text = source.replace(/[×·]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-').replace(/,/g, '');
    const raw = [];
    let index = 0;
    while (index < text.length) {
      if (/\s/.test(text[index])) { index += 1; continue; }
      const rest = text.slice(index);
      const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (number) {
        raw.push({ type: 'number', value: Number(number[0]) });
        index += number[0].length;
        continue;
      }
      const char = text[index].toLowerCase();
      if (char === 'x') raw.push({ type: 'variable', value: 'x' });
      else if ('+-*/^()'.includes(char)) raw.push({ type: char, value: char });
      else throw new Error(`“${text[index]}” 기호는 아직 읽을 수 없어요. 숫자, x, +, −, ×, ÷, ^, 괄호를 사용해 주세요.`);
      index += 1;
    }
    if (!raw.length) throw new Error('먼저 풀고 싶은 문제를 입력해 주세요.');

    const tokens = [];
    for (let i = 0; i < raw.length; i += 1) {
      const previous = raw[i - 1];
      const current = raw[i];
      const endsValue = previous && ['number', 'variable', ')'].includes(previous.type);
      const startsValue = ['number', 'variable', '('].includes(current.type);
      if (endsValue && startsValue) tokens.push({ type: '*', value: '*' });
      tokens.push(current);
    }
    return tokens;
  }

  function parse(source) {
    const tokens = tokenize(source);
    let position = 0;
    const peek = () => tokens[position];
    const take = (type) => {
      if (!peek() || peek().type !== type) return null;
      return tokens[position++];
    };

    function expression() {
      let node = term();
      while (peek() && (peek().type === '+' || peek().type === '-')) {
        const op = tokens[position++].type;
        node = { type: 'binary', op, left: node, right: term() };
      }
      return node;
    }
    function term() {
      let node = unary();
      while (peek() && (peek().type === '*' || peek().type === '/')) {
        const op = tokens[position++].type;
        node = { type: 'binary', op, left: node, right: unary() };
      }
      return node;
    }
    function unary() {
      if (take('+')) return { type: 'unary', op: '+', value: unary() };
      if (take('-')) return { type: 'unary', op: '-', value: unary() };
      return power();
    }
    function power() {
      let node = primary();
      if (take('^')) node = { type: 'binary', op: '^', left: node, right: unary() };
      return node;
    }
    function primary() {
      const number = take('number');
      if (number) return { type: 'number', value: number.value };
      if (take('variable')) return { type: 'variable' };
      if (take('(')) {
        const node = expression();
        if (!take(')')) throw new Error('괄호가 닫히지 않았어요. 짝이 맞는지 확인해 주세요.');
        return node;
      }
      throw new Error('수식을 읽지 못했어요. 숫자나 x로 시작하는 올바른 식을 입력해 주세요.');
    }

    const tree = expression();
    if (position < tokens.length) {
      if (peek().type === ')') throw new Error('닫는 괄호가 너무 많아요. 괄호의 짝을 확인해 주세요.');
      throw new Error('연산자가 빠졌거나 수식이 올바르지 않아요.');
    }
    return tree;
  }

  function evaluate(node) {
    if (node.type === 'number') return node.value;
    if (node.type === 'variable') throw new Error('계산식에는 x를 사용할 수 없어요. 방정식 형태로 입력해 주세요.');
    if (node.type === 'unary') return node.op === '-' ? -evaluate(node.value) : evaluate(node.value);
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (node.op === '+') return left + right;
    if (node.op === '-') return left - right;
    if (node.op === '*') return left * right;
    if (node.op === '/') {
      if (right === 0) throw new Error('0으로 나눌 수 없어요. 나누는 수를 확인해 주세요.');
      return left / right;
    }
    if (node.op === '^') return left ** right;
    return NaN;
  }

  function multiplyPolynomials(left, right) {
    const result = [0, 0, 0];
    for (let i = 0; i <= 2; i += 1) {
      for (let j = 0; j <= 2; j += 1) {
        if (Math.abs(left[i] * right[j]) < 1e-12) continue;
        if (i + j > 2) throw new Error('현재는 이차 이하의 다항방정식까지 풀 수 있어요.');
        result[i + j] += left[i] * right[j];
      }
    }
    return result;
  }

  function polynomial(node) {
    if (node.type === 'number') return [node.value, 0, 0];
    if (node.type === 'variable') return [0, 1, 0];
    if (node.type === 'unary') return polynomial(node.value).map((coefficient) => node.op === '-' ? -coefficient : coefficient);
    const left = polynomial(node.left);
    const right = polynomial(node.right);
    if (node.op === '+' || node.op === '-') return left.map((value, i) => value + (node.op === '+' ? right[i] : -right[i]));
    if (node.op === '*') return multiplyPolynomials(left, right);
    if (node.op === '/') {
      if (Math.abs(right[1]) > 1e-10 || Math.abs(right[2]) > 1e-10) throw new Error('문자를 포함한 식으로 나누는 방정식은 아직 풀 수 없어요.');
      if (Math.abs(right[0]) < 1e-10) throw new Error('0으로 나눌 수 없어요.');
      return left.map((coefficient) => coefficient / right[0]);
    }
    if (node.op === '^') {
      if (Math.abs(right[1]) > 1e-10 || Math.abs(right[2]) > 1e-10 || !Number.isInteger(right[0]) || right[0] < 0 || right[0] > 2) {
        throw new Error('방정식에서는 x의 지수를 0, 1, 2 중 하나로 입력해 주세요.');
      }
      let result = [1, 0, 0];
      for (let i = 0; i < right[0]; i += 1) result = multiplyPolynomials(result, left);
      return result;
    }
    return [0, 0, 0];
  }

  function formatPolynomial(coefficients) {
    const [constant, linear, quadratic] = coefficients;
    const terms = [];
    [[quadratic, 'x²'], [linear, 'x'], [constant, '']].forEach(([coefficient, variable]) => {
      if (Math.abs(coefficient) < 1e-10) return;
      const abs = Math.abs(coefficient);
      const magnitude = variable && Math.abs(abs - 1) < 1e-10 ? '' : cleanNumber(abs);
      const term = `${magnitude}${variable}`;
      if (!terms.length) terms.push(coefficient < 0 ? `−${term}` : term);
      else terms.push(`${coefficient < 0 ? '−' : '+'} ${term}`);
    });
    return terms.join(' ') || '0';
  }

  function expressionLabel(node, parentPrecedence = 0) {
    if (node.type === 'number') return cleanNumber(node.value);
    if (node.type === 'variable') return 'x';
    if (node.type === 'unary') return `${node.op === '-' ? '−' : ''}${expressionLabel(node.value, 3)}`;
    const precedence = node.op === '+' || node.op === '-' ? 1 : node.op === '*' || node.op === '/' ? 2 : 3;
    const symbol = { '*': '×', '/': '÷' }[node.op] || node.op;
    let label = `${expressionLabel(node.left, precedence)} ${symbol} ${expressionLabel(node.right, precedence + (node.op === '-' || node.op === '/' ? 1 : 0))}`;
    if (node.op === '^') label = `${expressionLabel(node.left, precedence)}^${expressionLabel(node.right, precedence)}`;
    if (precedence < parentPrecedence) label = `(${label})`;
    return label;
  }

  function collectCalculationSteps(node, steps) {
    if (node.type === 'number') return cleanNumber(node.value);
    if (node.type === 'variable') return 'x';
    if (node.type === 'unary') {
      const value = collectCalculationSteps(node.value, steps);
      const result = evaluate(node);
      const label = `${node.op === '-' ? '−' : '+'}${value}`;
      if (node.value.type !== 'number') steps.push(`${label} = ${cleanNumber(result)}`);
      return cleanNumber(result);
    }
    const left = collectCalculationSteps(node.left, steps);
    const right = collectCalculationSteps(node.right, steps);
    const result = evaluate(node);
    const symbol = { '*': '×', '/': '÷' }[node.op] || node.op;
    steps.push(`${left} ${symbol} ${right} = ${cleanNumber(result)}`);
    return cleanNumber(result);
  }

  function solveExpression(source, tree) {
    const result = evaluate(tree);
    const steps = [];
    collectCalculationSteps(tree, steps);
    if (!steps.length) steps.push(`${expressionLabel(tree)}는 이미 계산된 수예요.`);
    return {
      answer: cleanNumber(result),
      steps: steps.map((line, index) => ({ title: index === steps.length - 1 ? '계산을 마무리해요.' : '괄호와 곱셈·나눗셈부터 계산해요.', math: line })),
      problem: source.trim(),
    };
  }

  function solveEquation(source, leftTree, rightTree) {
    const left = polynomial(leftTree);
    const right = polynomial(rightTree);
    const coefficients = left.map((value, i) => value - right[i]);
    const [c, b, a] = coefficients;
    const degree = Math.abs(a) > 1e-10 ? 2 : Math.abs(b) > 1e-10 ? 1 : 0;
    const steps = [];
    const standard = `${formatPolynomial(coefficients)} = 0`;
    steps.push({ title: 'x항과 상수항을 왼쪽으로 모아요.', math: standard });

    if (degree === 0) {
      if (Math.abs(c) < 1e-10) {
        return { answer: '모든 실수', steps: [...steps, { title: '참이 되는 등식이에요.', math: '0 = 0 이므로 모든 실수가 해예요.' }], problem: source.trim() };
      }
      return { answer: '해가 없어요', steps: [...steps, { title: '모순이 생겨요.', math: `${cleanNumber(c)} = 0 은 성립하지 않아요.` }], problem: source.trim() };
    }

    if (degree === 1) {
      const moved = -c;
      steps.push({ title: '상수항을 오른쪽으로 옮겨요.', math: `${formatPolynomial([0, b, 0])} = ${cleanNumber(moved)}` });
      const answer = moved / b;
      steps.push({ title: '양변을 x의 계수로 나눠요.', math: `x = ${cleanNumber(moved)} ÷ ${cleanNumber(b)} = ${cleanNumber(answer)}` });
      return { answer: `x = ${cleanNumber(answer)}`, steps, problem: source.trim() };
    }

    const discriminant = b * b - 4 * a * c;
    steps.push({ title: '이차방정식의 계수를 확인해요.', math: `a = ${cleanNumber(a)},  b = ${cleanNumber(b)},  c = ${cleanNumber(c)}` });
    steps.push({ title: '판별식으로 실근의 개수를 알아봐요.', math: `D = b² − 4ac = (${cleanNumber(b)})² − 4(${cleanNumber(a)})(${cleanNumber(c)}) = ${cleanNumber(discriminant)}` });
    if (discriminant < -1e-10) {
      const real = cleanNumber(-b / (2 * a));
      const imaginary = cleanNumber(Math.sqrt(-discriminant) / Math.abs(2 * a));
      steps.push({ title: '판별식이 0보다 작으므로 실근은 없어요.', math: '복소수 범위에서 근의 공식을 적용해요.' });
      return { answer: `x = ${real} ± ${imaginary}i`, steps, problem: source.trim() };
    }
    if (Math.abs(discriminant) < 1e-10) {
      const root = -b / (2 * a);
      steps.push({ title: '판별식이 0이므로 중근 하나를 가져요.', math: `x = −b ÷ 2a = ${cleanNumber(-b)} ÷ ${cleanNumber(2 * a)} = ${cleanNumber(root)}` });
      return { answer: `x = ${cleanNumber(root)}`, steps, problem: source.trim() };
    }
    const sqrt = Math.sqrt(discriminant);
    const root1 = (-b + sqrt) / (2 * a);
    const root2 = (-b - sqrt) / (2 * a);
    steps.push({ title: '근의 공식에 값을 대입해요.', math: `x = (−b ± √D) ÷ 2a = (${cleanNumber(-b)} ± √${cleanNumber(discriminant)}) ÷ ${cleanNumber(2 * a)}` });
    steps.push({ title: '두 근을 각각 계산해요.', math: `x = ${cleanNumber(root1)} 또는 x = ${cleanNumber(root2)}` });
    return { answer: `x = ${cleanNumber(root1)},  ${cleanNumber(root2)}`, steps, problem: source.trim() };
  }

  function solve(source) {
    const equalParts = source.split('=');
    if (equalParts.length > 2) throw new Error('등호는 하나만 사용할 수 있어요.');
    if (equalParts.length === 2) {
      if (!equalParts[0].trim() || !equalParts[1].trim()) throw new Error('등호 양쪽에 모두 식을 입력해 주세요.');
      return solveEquation(source, parse(equalParts[0]), parse(equalParts[1]));
    }
    const tree = parse(source);
    if (source.toLowerCase().includes('x')) throw new Error('x가 들어간 식은 등호를 넣어 방정식으로 입력해 주세요. 예: 2x + 5 = 17');
    return solveExpression(source, tree);
  }

  function showSolution(solution) {
    problemOutput.textContent = solution.problem;
    answerOutput.textContent = solution.answer;
    stepsOutput.replaceChildren();
    solution.steps.forEach((step, index) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'step-number';
      number.textContent = String(index + 1);
      const text = document.createElement('span');
      text.className = 'step-text';
      const title = document.createElement('strong');
      title.textContent = step.title;
      const math = document.createElement('span');
      math.className = 'step-math';
      math.textContent = step.math;
      text.append(title, math);
      item.append(number, text);
      stepsOutput.append(item);
    });
    plainSolution = `문제: ${solution.problem}\n정답: ${solution.answer}\n${solution.steps.map((step, i) => `${i + 1}. ${step.title}\n   ${step.math}`).join('\n')}`;
    errorBox.hidden = true;
    emptyState.hidden = true;
    resultContent.hidden = false;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const source = input.value.trim();
      if (!source) throw new Error('먼저 풀고 싶은 문제를 입력해 주세요.');
      showSolution(solve(source));
    } catch (error) {
      errorBox.textContent = error.message || '문제를 풀지 못했어요. 식을 다시 확인해 주세요.';
      errorBox.hidden = false;
    }
  });

  document.querySelectorAll('.example-chip').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.problem;
      errorBox.hidden = true;
      input.focus();
      form.requestSubmit();
    });
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    errorBox.hidden = true;
    input.focus();
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(plainSolution);
      copyButton.innerHTML = '<span aria-hidden="true">✓</span> 복사됨';
      window.setTimeout(() => { copyButton.innerHTML = '<span aria-hidden="true">▢</span> 복사'; }, 1600);
    } catch {
      copyButton.textContent = '복사할 수 없어요';
    }
  });
});
