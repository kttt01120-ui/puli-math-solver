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
  const MAX_POLYNOMIAL_DEGREE = 20;

  const cleanNumber = (value) => {
    if (!Number.isFinite(value)) throw new Error('계산할 수 없는 값이 있어요. 0으로 나누지 않았는지 확인해 주세요.');
    const rounded = Math.abs(value) < 1e-10 ? 0 : Math.round(value * 1e10) / 1e10;
    return String(rounded);
  };

  function tokenize(source) {
    const text = source
      .replace(/[×·]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-')
      .replace(/π/g, 'pi').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => `^${'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(digit)}`)
      .replace(/√\s*(\([^()]*\)|(?:\d+(?:\.\d*)?|\.\d+))/g, 'sqrt($1)');
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
      else if (/[a-z]/i.test(char)) {
        const identifier = rest.match(/^[a-z]+/i)[0].toLowerCase();
        raw.push({ type: 'identifier', value: identifier });
        index += identifier.length;
        continue;
      }
      else if ('+-*/%^()'.includes(char)) raw.push({ type: char, value: char });
      else throw new Error(`“${text[index]}” 기호는 아직 읽을 수 없어요. 숫자, x, 연산 기호, 괄호, sqrt·sin·cos·tan·log·ln을 사용할 수 있어요.`);
      index += 1;
    }
    if (!raw.length) throw new Error('먼저 풀고 싶은 문제를 입력해 주세요.');

    const tokens = [];
    for (let i = 0; i < raw.length; i += 1) {
      const previous = raw[i - 1];
      const current = raw[i];
      const endsValue = previous && ['number', 'variable', ')'].includes(previous.type);
      const startsValue = ['number', 'variable', 'identifier', '('].includes(current.type);
      const functionBeforeParenthesis = previous?.type === 'identifier' && current.type === '(';
      const constantBefore = previous?.type === 'identifier' && ['pi', 'e'].includes(previous.value);
      if ((endsValue || constantBefore) && startsValue && !functionBeforeParenthesis) tokens.push({ type: '*', value: '*' });
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
      while (peek() && ['*', '/', '%'].includes(peek().type)) {
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
      const identifier = take('identifier');
      if (identifier) {
        if (identifier.value === 'pi') return { type: 'number', value: Math.PI };
        if (identifier.value === 'e') return { type: 'number', value: Math.E };
        const supported = ['sqrt', 'cbrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'log10', 'abs', 'exp', 'floor', 'ceil', 'round'];
        if (!supported.includes(identifier.value)) throw new Error(`“${identifier.value}” 함수는 아직 지원하지 않아요. sqrt, cbrt, sin, cos, tan, ln, log, abs, exp를 사용할 수 있어요.`);
        if (!take('(')) throw new Error(`${identifier.value} 함수 뒤에 괄호를 넣어 주세요. 예: ${identifier.value}(2)`);
        const argument = expression();
        if (!take(')')) throw new Error('함수의 괄호가 닫히지 않았어요.');
        return { type: 'function', name: identifier.value, value: argument };
      }
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

  function evaluate(node, variableValue = null) {
    if (node.type === 'number') return node.value;
    if (node.type === 'variable') {
      if (variableValue === null) throw new Error('계산식에는 x를 사용할 수 없어요. 방정식 형태로 입력해 주세요.');
      return variableValue;
    }
    if (node.type === 'unary') return node.op === '-' ? -evaluate(node.value, variableValue) : evaluate(node.value, variableValue);
    if (node.type === 'function') {
      const value = evaluate(node.value, variableValue);
      if (node.name === 'sqrt') {
        if (value < 0) throw new Error('실수 범위에서 음수의 제곱근은 계산할 수 없어요.');
        return Math.sqrt(value);
      }
      if (node.name === 'sin') return Math.sin(value);
      if (node.name === 'cos') return Math.cos(value);
      if (node.name === 'tan') {
        if (Math.abs(Math.cos(value)) < 1e-12) throw new Error('이 각도에서는 tan 값이 정의되지 않아요.');
        return Math.tan(value);
      }
      if (node.name === 'asin' || node.name === 'acos') {
        if (Math.abs(value) > 1) throw new Error(`${node.name}의 입력값은 -1과 1 사이여야 해요.`);
        return node.name === 'asin' ? Math.asin(value) : Math.acos(value);
      }
      if (node.name === 'atan') return Math.atan(value);
      if (node.name === 'cbrt') return Math.cbrt(value);
      if (node.name === 'sinh') return Math.sinh(value);
      if (node.name === 'cosh') return Math.cosh(value);
      if (node.name === 'tanh') return Math.tanh(value);
      if (node.name === 'floor') return Math.floor(value);
      if (node.name === 'ceil') return Math.ceil(value);
      if (node.name === 'round') return Math.round(value);
      if (node.name === 'ln' || node.name === 'log' || node.name === 'log10') {
        if (value <= 0) throw new Error('로그 함수의 입력값은 0보다 커야 해요.');
        return node.name === 'ln' ? Math.log(value) : Math.log10(value);
      }
      if (node.name === 'abs') return Math.abs(value);
      if (node.name === 'exp') return Math.exp(value);
    }
    const left = evaluate(node.left, variableValue);
    const right = evaluate(node.right, variableValue);
    if (node.op === '+') return left + right;
    if (node.op === '-') return left - right;
    if (node.op === '*') return left * right;
    if (node.op === '/') {
      if (right === 0) throw new Error('0으로 나눌 수 없어요. 나누는 수를 확인해 주세요.');
      return left / right;
    }
    if (node.op === '%') {
      if (right === 0) throw new Error('0으로 나눌 수 없어요. 나머지 연산의 오른쪽 값을 확인해 주세요.');
      return left % right;
    }
    if (node.op === '^') return left ** right;
    return NaN;
  }

  function multiplyPolynomials(left, right) {
    const result = new Array(MAX_POLYNOMIAL_DEGREE + 1).fill(0);
    for (let i = 0; i <= MAX_POLYNOMIAL_DEGREE; i += 1) {
      for (let j = 0; j <= MAX_POLYNOMIAL_DEGREE; j += 1) {
        if (Math.abs(left[i] * right[j]) < 1e-12) continue;
        if (i + j > MAX_POLYNOMIAL_DEGREE) throw new Error(`현재는 ${MAX_POLYNOMIAL_DEGREE}차 이하 다항식까지만 정확히 정리해요.`);
        result[i + j] += left[i] * right[j];
      }
    }
    return result;
  }

  function polynomial(node) {
    if (node.type === 'number') return [node.value, ...new Array(MAX_POLYNOMIAL_DEGREE).fill(0)];
    if (node.type === 'variable') return [0, 1, ...new Array(MAX_POLYNOMIAL_DEGREE - 1).fill(0)];
    if (node.type === 'function') throw new Error('함수 방정식은 수치 풀이가 필요해요.');
    if (node.type === 'unary') return polynomial(node.value).map((coefficient) => node.op === '-' ? -coefficient : coefficient);
    const left = polynomial(node.left);
    const right = polynomial(node.right);
    if (node.op === '+' || node.op === '-') return left.map((value, i) => value + (node.op === '+' ? right[i] : -right[i]));
    if (node.op === '*') return multiplyPolynomials(left, right);
    if (node.op === '/') {
      if (right.slice(1).some((coefficient) => Math.abs(coefficient) > 1e-10)) throw new Error('문자를 포함한 식으로 나누는 방정식은 아직 풀 수 없어요.');
      if (Math.abs(right[0]) < 1e-10) throw new Error('0으로 나눌 수 없어요.');
      return left.map((coefficient) => coefficient / right[0]);
    }
    if (node.op === '%') throw new Error('나머지 연산 방정식은 수치 풀이가 필요해요.');
    if (node.op === '^') {
      if (right.slice(1).some((coefficient) => Math.abs(coefficient) > 1e-10) || !Number.isInteger(right[0]) || right[0] < 0 || right[0] > MAX_POLYNOMIAL_DEGREE) {
        throw new Error('다항식 차수를 넘는 지수예요. 수치 풀이를 시도할게요.');
      }
      let result = [1, ...new Array(MAX_POLYNOMIAL_DEGREE).fill(0)];
      for (let i = 0; i < right[0]; i += 1) result = multiplyPolynomials(result, left);
      return result;
    }
    return [0, 0, 0];
  }

  function formatPolynomial(coefficients) {
    const terms = [];
    for (let power = coefficients.length - 1; power >= 0; power -= 1) {
      const coefficient = coefficients[power];
      if (Math.abs(coefficient) < 1e-10) continue;
      const variable = power === 0 ? '' : power === 1 ? 'x' : `x${{ 2: '²', 3: '³', 4: '⁴' }[power] || `^${power}`}`;
      const abs = Math.abs(coefficient);
      const magnitude = variable && Math.abs(abs - 1) < 1e-10 ? '' : cleanNumber(abs);
      const term = `${magnitude}${variable}`;
      if (!terms.length) terms.push(coefficient < 0 ? `−${term}` : term);
      else terms.push(`${coefficient < 0 ? '−' : '+'} ${term}`);
    }
    return terms.join(' ') || '0';
  }

  function expressionLabel(node, parentPrecedence = 0) {
    if (node.type === 'number') return cleanNumber(node.value);
    if (node.type === 'variable') return 'x';
    if (node.type === 'unary') return `${node.op === '-' ? '−' : ''}${expressionLabel(node.value, 3)}`;
    if (node.type === 'function') return `${node.name}(${expressionLabel(node.value)})`;
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
    if (node.type === 'function') {
      const argument = collectCalculationSteps(node.value, steps);
      const result = evaluate(node);
      steps.push(`${node.name}(${argument}) = ${cleanNumber(result)}`);
      return cleanNumber(result);
    }
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

  function polynomialValue(coefficients, x) {
    let result = 0;
    for (let i = coefficients.length - 1; i >= 0; i -= 1) result = result * x + coefficients[i];
    return result;
  }

  function findRealRoots(inputCoefficients) {
    function isolate(coefficients) {
      while (coefficients.length > 1 && Math.abs(coefficients[coefficients.length - 1]) < 1e-12) coefficients.pop();
      const degree = coefficients.length - 1;
      if (degree <= 0) return [];
      if (degree === 1) return [-coefficients[0] / coefficients[1]];

      const leading = coefficients[degree];
      const bound = 1 + Math.max(...coefficients.slice(0, degree).map((value) => Math.abs(value / leading)));
      const derivative = coefficients.slice(1).map((value, index) => value * (index + 1));
      const critical = isolate(derivative).filter((value) => value > -bound && value < bound).sort((a, b) => a - b);
      const points = [-bound, ...critical, bound];
      const scaleAt = (x) => coefficients.reduce((sum, value, power) => sum + Math.abs(value) * Math.max(1, Math.abs(x) ** power), 0);
      const nearZero = (value, x) => Math.abs(value) <= 1e-9 * Math.max(1, scaleAt(x));
      const roots = [];

      critical.forEach((point) => {
        if (nearZero(polynomialValue(coefficients, point), point)) roots.push(point);
      });

      for (let i = 0; i < points.length - 1; i += 1) {
        let low = points[i];
        let high = points[i + 1];
        let lowValue = polynomialValue(coefficients, low);
        let highValue = polynomialValue(coefficients, high);
        if (nearZero(lowValue, low) || nearZero(highValue, high) || (lowValue < 0) === (highValue < 0)) continue;
        for (let iteration = 0; iteration < 120; iteration += 1) {
          const middle = (low + high) / 2;
          const middleValue = polynomialValue(coefficients, middle);
          if (nearZero(middleValue, middle) || high - low < 1e-12 * Math.max(1, Math.abs(middle))) {
            low = middle;
            high = middle;
            break;
          }
          if ((lowValue < 0) === (middleValue < 0)) {
            low = middle;
            lowValue = middleValue;
          } else {
            high = middle;
            highValue = middleValue;
          }
        }
        roots.push((low + high) / 2);
      }
      return roots.sort((a, b) => a - b).filter((root, index, list) => index === 0 || Math.abs(root - list[index - 1]) > 1e-7 * Math.max(1, Math.abs(root)));
    }
    return isolate([...inputCoefficients]);
  }

  function solveNumerically(source, leftTree, rightTree) {
    const range = 100;
    const step = 0.1;
    const difference = (x) => {
      try {
        const value = evaluate(leftTree, x) - evaluate(rightTree, x);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    };
    const samples = [];
    for (let index = 0; index <= range * 2 / step; index += 1) {
      const x = -range + index * step;
      samples.push({ x, value: difference(x) });
    }
    const roots = [];
    const addRoot = (root) => {
      if (Number.isFinite(root) && !roots.some((existing) => Math.abs(existing - root) < 1e-5 * Math.max(1, Math.abs(root)))) roots.push(root);
    };

    for (let index = 0; index < samples.length; index += 1) {
      const current = samples[index];
      if (current.value === 0) addRoot(current.x);
      if (index === 0 || index === samples.length - 1) continue;
      const previous = samples[index - 1];
      const next = samples[index + 1];
      if (current.value === null || previous.value === null || next.value === null) continue;

      if ((previous.value < 0) !== (current.value < 0)) {
        let low = previous.x;
        let high = current.x;
        let lowValue = previous.value;
        for (let iteration = 0; iteration < 80; iteration += 1) {
          const middle = (low + high) / 2;
          const middleValue = difference(middle);
          if (middleValue === null) break;
          if ((lowValue < 0) !== (middleValue < 0)) high = middle;
          else { low = middle; lowValue = middleValue; }
          if (high - low < 1e-10) break;
        }
        const candidate = (low + high) / 2;
        const residual = difference(candidate);
        if (residual !== null && Math.abs(residual) < 1e-7) addRoot(candidate);
      }

      // Also look for roots that touch zero without changing sign (for example, x² = 0).
      if (Math.abs(current.value) < Math.abs(previous.value) && Math.abs(current.value) <= Math.abs(next.value)) {
        let low = previous.x;
        let high = next.x;
        for (let iteration = 0; iteration < 45; iteration += 1) {
          const first = low + (high - low) / 3;
          const second = high - (high - low) / 3;
          const firstValue = difference(first);
          const secondValue = difference(second);
          if (firstValue === null || secondValue === null) break;
          if (Math.abs(firstValue) <= Math.abs(secondValue)) high = second;
          else low = first;
        }
        const candidate = (low + high) / 2;
        const residual = difference(candidate);
        if (residual !== null && Math.abs(residual) < 1e-7) addRoot(candidate);
      }
    }

    roots.sort((a, b) => a - b);
    const shownRoots = [...roots].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 20).sort((a, b) => a - b);
    const steps = [
      { title: '방정식을 한쪽으로 모아요.', math: `f(x) = ${expressionLabel(leftTree)} − (${expressionLabel(rightTree)}) = 0` },
      { title: '수치적으로 근을 찾아요.', math: `−${range}부터 ${range}까지 탐색하며 부호가 바뀌거나 0에 가까워지는 지점을 좁혀요.` },
    ];
    if (!shownRoots.length) {
      steps.push({ title: '탐색 범위 안에서 근을 찾지 못했어요.', math: '해가 없다는 뜻은 아니에요. 다른 범위에 해가 있거나 식의 형태가 수치적으로 풀기 어려울 수 있어요.' });
      return { answer: '근을 찾지 못했어요', steps, problem: source.trim() };
    }
    const formatted = shownRoots.map(cleanNumber);
    steps.push({ title: '찾은 근을 원래 식에 대입해 확인해요.', math: formatted.map((root) => `x ≈ ${root} (좌우 식의 차 ≈ ${cleanNumber(difference(Number(root)))})`).join('  ·  ') });
    if (roots.length > shownRoots.length) steps.push({ title: '검색 결과를 일부만 표시해요.', math: `총 ${roots.length}개의 근 중 원점에 가까운 20개를 표시했어요.` });
    return { answer: `x ≈ ${formatted.join(', ')}`, steps, problem: source.trim() };
  }

  function solveEquation(source, leftTree, rightTree) {
    let left;
    let right;
    try {
      left = polynomial(leftTree);
      right = polynomial(rightTree);
    } catch {
      return solveNumerically(source, leftTree, rightTree);
    }
    const coefficients = left.map((value, i) => value - right[i]);
    let degree = coefficients.length - 1;
    while (degree > 0 && Math.abs(coefficients[degree]) < 1e-10) degree -= 1;
    const c = coefficients[0];
    const b = coefficients[1];
    const a = coefficients[2];
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

    if (degree > 2) {
      const roots = findRealRoots(coefficients);
      steps.push({ title: '다항식의 계수를 정리해요.', math: `최고차항은 ${degree}차예요. ${formatPolynomial(coefficients)} = 0` });
      steps.push({ title: '수치적으로 실근을 찾아요.', math: '근의 공식 대신, 근이 있는 구간을 좁혀 근삿값을 계산해요.' });
      if (!roots.length) {
        steps.push({ title: '실수 범위에서 근이 없어요.', math: '실수 해를 찾지 못했어요. 복소수 근은 이 단계에서 표시하지 않아요.' });
        return { answer: '실수 해 없음', steps, problem: source.trim() };
      }
      const formattedRoots = roots.map(cleanNumber);
      steps.push({ title: '찾은 근을 원래 식에 대입해 확인해요.', math: formattedRoots.map((root) => `x ≈ ${root} (식의 값 ≈ ${cleanNumber(polynomialValue(coefficients, Number(root)))})`).join('  ·  ') });
      return { answer: `x ≈ ${formattedRoots.join(', ')}`, steps, problem: source.trim() };
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
