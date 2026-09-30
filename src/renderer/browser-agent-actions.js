(function exposeBrowserAgentActions(root, factory) {
  const actions = factory();
  if (root) root.browserAgentActions = actions;
  if (typeof module === 'object' && module.exports) module.exports = actions;
})(typeof window !== 'undefined' ? window : null, () => {
  const ACTION_TYPES = Object.freeze([
    'screenshot', 'mouse_move', 'click', 'mouse_down', 'mouse_up', 'scroll', 'drag',
    'keypress', 'key_down', 'key_up', 'type', 'wait',
  ]);

  const KEY_ALIASES = Object.freeze({
    ALT: 'Alt',
    ALT_LEFT: 'Alt',
    ALT_L: 'Alt',
    ALT_RIGHT: 'Alt',
    ALT_R: 'Alt',
    ALTLEFT: 'Alt',
    ALTRIGHT: 'Alt',
    ARROWDOWN: 'Down',
    ARROWLEFT: 'Left',
    ARROWRIGHT: 'Right',
    ARROWUP: 'Up',
    BACKSPACE: 'Backspace',
    CAPSLOCK: 'Capslock',
    CTRL: 'Control',
    CTRL_L: 'Control',
    CTRL_R: 'Control',
    CONTROL: 'Control',
    CONTROL_LEFT: 'Control',
    CONTROL_L: 'Control',
    CONTROL_RIGHT: 'Control',
    CONTROL_R: 'Control',
    DELETE: 'Delete',
    DOWN: 'Down',
    END: 'End',
    ENTER: 'Enter',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    HOME: 'Home',
    INSERT: 'Insert',
    LEFT: 'Left',
    META: 'Meta',
    META_LEFT: 'Meta',
    META_L: 'Meta',
    META_RIGHT: 'Meta',
    META_R: 'Meta',
    METALEFT: 'Meta',
    METARIGHT: 'Meta',
    CMD: 'Meta',
    COMMAND: 'Meta',
    COMMANDORCONTROL: 'Control',
    CMDORCTRL: 'Control',
    CTRLORCMD: 'Control',
    CONTROLLEFT: 'Control',
    CONTROLRIGHT: 'Control',
    PAGEDOWN: 'PageDown',
    PAGE_DOWN: 'PageDown',
    PAGEUP: 'PageUp',
    PAGE_UP: 'PageUp',
    RETURN: 'Enter',
    RIGHT: 'Right',
    SHIFT: 'Shift',
    SHIFT_L: 'Shift',
    SHIFT_R: 'Shift',
    SHIFT_LEFT: 'Shift',
    SHIFT_RIGHT: 'Shift',
    SHIFTLEFT: 'Shift',
    SHIFTRIGHT: 'Shift',
    SPACE: 'Space',
    NUMLOCK: 'Numlock',
    SCROLLLOCK: 'Scrolllock',
    TAB: 'Tab',
    UP: 'Up',
  });

  const MOUSE_BUTTONS = new Set(['left', 'middle', 'right']);

  function finiteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(`${label}无效`);
    }
    return Math.round(number);
  }

  function point(x, y, label = '坐标') {
    return {
      x: finiteNumber(x, `${label} X`, { min: 0 }),
      y: finiteNumber(y, `${label} Y`, { min: 0 }),
    };
  }

  function pointFrom(value, label = '坐标') {
    if (Array.isArray(value) && value.length >= 2) return point(value[0], value[1], label);
    if (value && typeof value === 'object') return point(value.x, value.y, label);
    throw new Error(`${label}无效`);
  }

  function normalizeButton(value) {
    const button = String(value || 'left').trim().toLowerCase();
    if (!MOUSE_BUTTONS.has(button)) throw new Error('鼠标按键无效');
    return button;
  }

  function normalizeKey(value) {
    const source = String(value || '').trim();
    if (!source) throw new Error('键盘按键不能为空');
    const alias = KEY_ALIASES[source.toUpperCase().replace(/[ -]/g, '_')];
    if (alias) return alias;
    if (/^[a-z]$/i.test(source)) return source.toUpperCase();
    if (/^[0-9]$/.test(source)) return source;
    if (/^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(source)) return source.toUpperCase();
    if (/^NUMPAD_[0-9]$/i.test(source)) return `num${source.slice(-1)}`;
    if (/^NUMPAD_(?:DECIMAL|ADD|SUBTRACT|MULTIPLY|DIVIDE)$/i.test(source)) {
      return { DECIMAL: 'numdec', ADD: 'numadd', SUBTRACT: 'numsub', MULTIPLY: 'nummult', DIVIDE: 'numdiv' }[source.slice(7).toUpperCase()];
    }
    if (/^NUM[0-9]$/i.test(source)) return source.toLowerCase();
    const namedPunctuation = {
      COMMA: ',',
      PERIOD: '.',
      SLASH: '/',
      SEMICOLON: ';',
      QUOTE: "'",
      BRACKETLEFT: '[',
      BRACKETRIGHT: ']',
      BACKSLASH: '\\',
      MINUS: '-',
      EQUAL: '=',
      BACKQUOTE: '`',
    };
    if (namedPunctuation[source.toUpperCase()]) return namedPunctuation[source.toUpperCase()];
    const punctuation = {
      ',': ',',
      '.': '.',
      '/': '/',
      ';': ';',
      "'": "'",
      '[': '[',
      ']': ']',
      '\\': '\\',
      '-': '-',
      '=': '=',
      '`': '`',
    };
    if (punctuation[source]) return punctuation[source];
    throw new Error(`不支持的键盘按键：${source}`);
  }

  function normalizeKeys(value) {
    const values = Array.isArray(value)
      ? value
      : String(value || '').split('+').map((item) => item.trim()).filter(Boolean);
    if (!values.length) throw new Error('键盘组合无效');
    return values.map(normalizeKey);
  }

  function readActionType(value) {
    const source = String(value || '').trim().toLowerCase().replace(/[ -]/g, '_');
    const aliases = {
      doubleclick: 'double_click',
      double_click: 'double_click',
      double_click_action: 'double_click',
      keydown: 'key_down',
      keypress: 'keypress',
      key_press: 'keypress',
      keyboard_press: 'keypress',
      keyup: 'key_up',
      keyboard: 'keypress',
      computer_screenshot: 'screenshot',
      move: 'mouse_move',
      mousemove: 'mouse_move',
      mouse_click: 'click',
      left_click: 'click',
      right_click: 'right_click',
      middle_click: 'middle_click',
      mouse_down: 'mouse_down',
      mousedown: 'mouse_down',
      mouse_up: 'mouse_up',
      mouseup: 'mouse_up',
      observe: 'screenshot',
      screenshot: 'screenshot',
      scroll: 'scroll',
      scroll_page: 'scroll',
      type: 'type',
      input_text: 'type',
      drag: 'drag',
      drag_and_drop: 'drag',
      click: 'click',
      wait: 'wait',
      pause: 'wait',
    };
    return aliases[source] || source;
  }

  function actionPoint(source, label = '坐标') {
    if (source && source.x !== undefined && source.y !== undefined) return point(source.x, source.y, label);
    if (source && source.coordinate !== undefined) return pointFrom(source.coordinate, label);
    if (source && source.coordinates !== undefined) return pointFrom(source.coordinates, label);
    return pointFrom(source, label);
  }

  function normalizeAgentAction(input) {
    let source = input;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        throw new Error('动作必须是 JSON 对象');
      }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('动作必须是对象');
    }
    if (source.action && source.action !== source && typeof source.action === 'object' && !Array.isArray(source.action)) {
      return normalizeAgentAction(source.action);
    }

    const rawType = String(source.type || source.action || source.kind || '').trim().toLowerCase().replace(/[ -]/g, '_');
    const type = readActionType(rawType);
    switch (type) {
      case 'screenshot': {
        const action = { type };
        if (source.includeText !== undefined) action.includeText = source.includeText !== false;
        if (source.includeScreenshot !== undefined) action.includeScreenshot = source.includeScreenshot !== false;
        return action;
      }
      case 'mouse_move': {
        const p = actionPoint(source, '鼠标坐标');
        return { type, ...p };
      }
      case 'click':
      case 'right_click':
      case 'middle_click':
      case 'double_click': {
        const p = actionPoint(source, '鼠标坐标');
        const clickCount = type === 'double_click'
          ? 2
          : finiteNumber(source.clickCount ?? 1, '点击次数', { min: 1 });
        if (!Number.isSafeInteger(clickCount)) throw new Error('点击次数无效');
        const defaultButton = type === 'right_click' ? 'right' : type === 'middle_click' ? 'middle' : 'left';
        return { type: 'click', ...p, button: normalizeButton(source.button || defaultButton), clickCount };
      }
      case 'mouse_down':
      case 'mouse_up': {
        const p = actionPoint(source, '鼠标坐标');
        return { type, ...p, button: normalizeButton(source.button) };
      }
      case 'scroll': {
        const p = actionPoint(source, '滚动坐标');
        const deltaX = finiteNumber(source.deltaX ?? source.scrollX ?? source.scroll_x ?? 0, '水平滚动量');
        const deltaY = finiteNumber(source.deltaY ?? source.scrollY ?? source.scroll_y ?? 0, '垂直滚动量');
        if (deltaX === 0 && deltaY === 0) throw new Error('滚动量不能为零');
        return { type, ...p, deltaX, deltaY };
      }
      case 'drag': {
        let rawPath = source.path;
        if (!Array.isArray(rawPath) || rawPath.length < 2) {
          const from = source.from || (source.from_x !== undefined && source.from_y !== undefined
            ? { x: source.from_x, y: source.from_y } : null);
          const to = source.to || (source.to_x !== undefined && source.to_y !== undefined
            ? { x: source.to_x, y: source.to_y } : null);
          const normalizedFrom = actionPoint(from, '拖拽起点');
          const normalizedTo = actionPoint(to, '拖拽终点');
          rawPath = [normalizedFrom, normalizedTo];
        }
        const path = rawPath.map((item, index) => actionPoint(item, `拖拽点 ${index + 1}`));
        return { type, path, button: normalizeButton(source.button) };
      }
      case 'keypress':
        return { type, keys: normalizeKeys(source.keys ?? source.key) };
      case 'key_down':
      case 'key_up':
        return { type, key: normalizeKey(source.key) };
      case 'type': {
        const text = String(source.text ?? source.value ?? '');
        if (!text) throw new Error('输入文本不能为空');
        return { type, text };
      }
      case 'wait': {
        const ms = finiteNumber(source.ms ?? source.duration ?? 250, '等待时间', { min: 0 });
        if (!Number.isSafeInteger(ms)) throw new Error('等待时间无效');
        return { type, ms };
      }
      default:
        throw new Error(`不支持的动作：${type || '空'}`);
    }
  }

  function keyPressEvents(keys) {
    const normalized = normalizeKeys(keys);
    const modifiers = new Set(['Alt', 'Control', 'Meta', 'Shift']);
    const down = [];
    for (const keyCode of normalized) {
      down.push({ type: 'rawKeyDown', keyCode });
      if (!modifiers.has(keyCode)) down.push({ type: 'char', keyCode });
    }
    return [
      ...down,
      ...normalized.slice().reverse().map((keyCode) => ({ type: 'keyUp', keyCode })),
    ];
  }

  function actionLabel(action) {
    const normalized = normalizeAgentAction(action);
    const coordinate = (x, y) => `（${x}, ${y}）`;
    const keyLabel = (key) => ({ Control: 'Ctrl' }[key] || key);
    switch (normalized.type) {
      case 'screenshot': return '观察页面';
      case 'mouse_move': return `移动鼠标到页面坐标${coordinate(normalized.x, normalized.y)}`;
      case 'click': return `${normalized.button === 'right' ? '右键点击' : normalized.button === 'middle' ? '中键点击' : normalized.clickCount > 1 ? '双击' : '点击'}页面坐标${coordinate(normalized.x, normalized.y)}`;
      case 'mouse_down': return `在页面坐标${coordinate(normalized.x, normalized.y)}按下${normalized.button}键`;
      case 'mouse_up': return `在页面坐标${coordinate(normalized.x, normalized.y)}释放${normalized.button}键`;
      case 'scroll': {
        const direction = normalized.deltaY ? (normalized.deltaY > 0 ? '向下' : '向上') : (normalized.deltaX > 0 ? '向右' : '向左');
        const distance = Math.abs(normalized.deltaY || normalized.deltaX);
        return `在页面坐标${coordinate(normalized.x, normalized.y)}${direction}滚动 ${distance}px`;
      }
      case 'drag': {
        const from = normalized.path[0];
        const to = normalized.path[normalized.path.length - 1];
        return `拖拽页面坐标${coordinate(from.x, from.y)}到${coordinate(to.x, to.y)}`;
      }
      case 'keypress': return `按键 ${normalized.keys.map(keyLabel).join('+')}`;
      case 'key_down': return `按下 ${keyLabel(normalized.key)}`;
      case 'key_up': return `释放 ${keyLabel(normalized.key)}`;
      case 'type': return `输入文字（${normalized.text.length} 字）`;
      case 'wait': return `等待 ${normalized.ms}ms`;
      default: return '网页动作';
    }
  }

  function encodeString(value) {
    return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  function pageReadScript() {
    return String.raw`(() => {
      const limit = 12000;
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const clip = (value, max) => {
        const text = clean(value);
        return text.length > max ? text.slice(0, max) + '…' : text;
      };
      const description = document.querySelector('meta[name="description"]')?.content || '';
      return {
        title: document.title || '',
        url: location.href,
        description: clip(description, 500),
        text: clip(document.body?.innerText || '', limit),
      };
    })()`;
  }

  function humanVerificationScript() {
    return String.raw`(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const title = clean(document.title || '');
      const url = String(location.href || '');
      const text = clean(document.body?.innerText || '').slice(0, 12000);
      const explicitMarker = /(?:verify\s+(?:you\s+are\s+)?human|prove\s+(?:you\s+are\s+)?human|human\s+verification|确认你(?:是|为)真人|人机验证|安全验证|图形验证码|滑块验证)/i;
      const providerMarker = /(?:captcha|recaptcha|hcaptcha|turnstile)/i;
      const candidates = Array.from(document.querySelectorAll('iframe, [data-sitekey], [data-callback], input, textarea, [role="checkbox"]')).slice(0, 200);
      const widget = candidates.find((node) => providerMarker.test([
        node.id,
        node.className,
        node.getAttribute('src'),
        node.getAttribute('title'),
        node.getAttribute('aria-label'),
        node.getAttribute('name'),
      ].filter(Boolean).join(' ')));
      const pageMarker = title + ' ' + url;
      const required = Boolean(widget || explicitMarker.test(pageMarker + ' ' + text) || providerMarker.test(pageMarker));
      return {
        required,
        reason: required ? (widget ? 'challenge-widget' : explicitMarker.test(pageMarker + ' ' + text) ? 'human-verification-marker' : 'challenge-url') : '',
        title: title.slice(0, 200),
        url: url.slice(0, 1000),
      };
    })()`;
  }

  function linksScript() {
    return String.raw`(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map((node) => {
        const href = node.href || '';
        return { text: clean(node.innerText || node.textContent || href).slice(0, 200), href };
      }).filter((item) => /^(https?|mailto):/i.test(item.href));
    })()`;
  }

  function tablesScript() {
    return String.raw`(() => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      return Array.from(document.querySelectorAll('table')).slice(0, 8).map((table, tableIndex) => ({
        index: tableIndex + 1,
        rows: Array.from(table.querySelectorAll('tr')).slice(0, 24).map((row) =>
          Array.from(row.querySelectorAll('th,td')).slice(0, 14).map((cell) => clean(cell.innerText || cell.textContent))
        ),
      }));
    })()`;
  }

  function scrollScript(position) {
    const safePosition = position === 'bottom' ? 'bottom' : 'top';
    const top = safePosition === 'bottom' ? 'document.documentElement.scrollHeight' : '0';
    return `(() => { window.scrollTo({ top: ${top}, behavior: 'smooth' }); return { ok: true, position: '${safePosition}' }; })()`;
  }

  function clickScript(selector) {
    const encoded = encodeString(String(selector || ''));
    return `(() => {
      try {
        const node = document.querySelector(${encoded});
        if (!node) return { ok: false, error: '未找到匹配元素' };
        if (typeof node.click !== 'function') return { ok: false, error: '元素不可点击' };
        node.click();
        return { ok: true, tag: node.tagName, text: String(node.innerText || node.value || '').trim().slice(0, 160) };
      } catch (error) {
        return { ok: false, error: '选择器无效' };
      }
    })()`;
  }

  function fillScript(selector, value) {
    const encodedSelector = encodeString(String(selector || ''));
    const encodedValue = encodeString(String(value || ''));
    return `(() => {
      try {
        const node = document.querySelector(${encodedSelector});
        if (!node) return { ok: false, error: '未找到匹配元素' };
        if ('value' in node) {
          node.focus();
          node.value = ${encodedValue};
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (node.isContentEditable) {
          node.focus();
          node.textContent = ${encodedValue};
          node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${encodedValue} }));
        } else {
          return { ok: false, error: '元素不支持填写' };
        }
        return { ok: true, tag: node.tagName, valueLength: String(${encodedValue}).length };
      } catch (error) {
        return { ok: false, error: '选择器或输入操作无效' };
      }
    })()`;
  }

  function selectScript(selector, value) {
    const encodedSelector = encodeString(String(selector || ''));
    const encodedValue = encodeString(String(value || ''));
    return `(() => {
      try {
        const node = document.querySelector(${encodedSelector});
        if (!node) return { ok: false, error: '未找到匹配元素' };
        if (node.tagName !== 'SELECT') return { ok: false, error: '元素不是下拉选择框' };
        const wanted = String(${encodedValue});
        const option = Array.from(node.options || []).find((item) => item.value === wanted || String(item.textContent || '').trim() === wanted);
        if (!option) return { ok: false, error: '未找到匹配选项' };
        node.focus();
        node.value = option.value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, tag: node.tagName, value: node.value, label: String(option.textContent || '').trim().slice(0, 160) };
      } catch (error) {
        return { ok: false, error: '选择器或下拉操作无效' };
      }
    })()`;
  }

  function coordinatePair(value) {
    const match = String(value || '').match(/^\s*\(?\s*(\d+(?:\.\d+)?)\s*[,，]\s*(\d+(?:\.\d+)?)\s*\)?\s*$/);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  function parseVirtualCommand(text) {
    if (/^(截图|截屏|观察(?:当前)?页面|获取页面截图)$/i.test(text)) {
      return { kind: 'input', label: '观察页面', inputAction: { type: 'screenshot' } };
    }

    const dragMatch = text.match(/^(?:拖拽|拖动)(?:坐标)?\s*(.+?)\s*(?:到|至|->)\s*(.+)$/i);
    if (dragMatch) {
      const from = coordinatePair(dragMatch[1]);
      const to = coordinatePair(dragMatch[2]);
      if (from && to) return { kind: 'input', label: '拖拽元素', inputAction: { type: 'drag', from, to } };
    }

    const clickMatch = text.match(/^(双击|右键点击|点击右键|点击)(?:坐标)?\s*(.+)$/i);
    if (clickMatch) {
      const coordinates = coordinatePair(clickMatch[2]);
      if (coordinates) {
        const label = clickMatch[1];
        const button = /右键/.test(label) ? 'right' : 'left';
        const type = label === '双击' ? 'double_click' : 'click';
        const inputAction = { type, ...coordinates, button };
        return { kind: 'input', label: actionLabel(inputAction), inputAction };
      }
    }

    const moveMatch = text.match(/^(?:移动鼠标|鼠标移动|移动到)(?:坐标)?\s*(.+)$/i);
    if (moveMatch) {
      const coordinates = coordinatePair(moveMatch[1]);
      if (coordinates) {
        const inputAction = { type: 'mouse_move', ...coordinates };
        return { kind: 'input', label: actionLabel(inputAction), inputAction };
      }
    }

    const scrollMatch = text.match(/^(?:滚轮|滚动)(?:坐标)?\s*(.+?)(?:\s*[:：]\s*|\s+)([-+]?\d+(?:\.\d+)?)\s*[,，]\s*([-+]?\d+(?:\.\d+)?)$/i);
    if (scrollMatch) {
      const coordinates = coordinatePair(scrollMatch[1]);
      if (coordinates) {
        return {
          kind: 'input',
          label: actionLabel({ type: 'scroll', ...coordinates, deltaX: Number(scrollMatch[2]), deltaY: Number(scrollMatch[3]) }),
          inputAction: { type: 'scroll', ...coordinates, deltaX: Number(scrollMatch[2]), deltaY: Number(scrollMatch[3]) },
        };
      }
    }

    const keyMatch = text.match(/^(?:按键|键盘|快捷键)\s+(.+)$/i);
    if (keyMatch) {
      const inputAction = { type: 'keypress', keys: keyMatch[1] };
      return { kind: 'input', label: actionLabel(inputAction), inputAction };
    }
    const typeMatch = text.match(/^(?:输入文本|键入|打字)\s+([\s\S]+)$/i);
    if (typeMatch) {
      const inputAction = { type: 'type', text: typeMatch[1] };
      return { kind: 'input', label: actionLabel(inputAction), inputAction };
    }

    if (/^\s*\{/.test(text)) {
      try {
        const action = normalizeAgentAction(text);
        return { kind: 'input', label: actionLabel(action), inputAction: action };
      } catch {
        return { kind: 'help', label: '使用说明' };
      }
    }
    return null;
  }

  function parseCommand(input) {
    const source = String(input || '').trim();
    const text = source.replace(/\s+/g, ' ');
    if (!text) return null;
    const virtualCommand = parseVirtualCommand(text);
    if (virtualCommand) return virtualCommand;
    if (/^(读取|查看|总结|分析)(当前)?(页面|网页)?/.test(text) || /^(提取|获取)(当前)?页面(正文|信息|内容)/.test(text)) return { kind: 'page', label: '读取页面' };
    if (/(收集|提取|获取).*(链接|网址|超链接)/.test(text)) return { kind: 'links', label: '收集链接' };
    if (/(收集|提取|获取).*(表格|表单元格)/.test(text)) return { kind: 'tables', label: '收集表格' };
    if (/滚动.*(顶部|最上面)|回到顶部/.test(text)) return { kind: 'top', label: '滚动到顶部' };
    if (/滚动.*(底部|最下面)|到底部/.test(text)) return { kind: 'bottom', label: '滚动到底部' };

    const openMatch = text.match(/^(?:打开|访问|跳转到?)\s+(.+)$/i);
    if (openMatch) return { kind: 'open', label: '打开页面', url: openMatch[1].replace(/[。！？]+$/, '') };
    const clickMatch = text.match(/^点击(?:选择器|元素)\s+(.+)$/i);
    if (clickMatch) {
      return { kind: 'click', label: '点击元素', selector: clickMatch[1].trim() };
    }
    const fillMatch = text.match(/^填写选择器\s+(.+)$/i);
    if (fillMatch) {
      const payload = fillMatch[1];
      const separator = Math.max(payload.indexOf('：'), payload.lastIndexOf(':'));
      if (separator > 0) {
        const selector = payload.slice(0, separator).trim();
        const value = payload.slice(separator + 1).trim();
        if (selector && value) {
          return { kind: 'fill', label: '填写元素', selector, value };
        }
      }
    }
    return { kind: 'help', label: '使用说明' };
  }

  return Object.freeze({
    actionLabel,
    actionTypes: ACTION_TYPES,
    clickScript,
    fillScript,
    humanVerificationScript,
    keyPressEvents,
    linksScript,
    normalizeAgentAction,
    pageReadScript,
    parseCommand,
    selectScript,
    scrollScript,
    tablesScript,
  });
});
