(() => {
  'use strict';

  const form = document.querySelector('#contact-form');
  const result = document.querySelector('#form-result');
  const characterCount = document.querySelector('#message-count');
  const fields = ['name', 'email', 'message'].map((name) => ({
    name,
    input: form.querySelector(`[name="${name}"]`),
    errorElement: document.querySelector(`#${name}-error`),
  }));
  const state = { values: {}, errors: {}, validated: new Set(), submitted: false };

  const validateField = ({ name, input }) => {
    const value = input.value.trim();
    state.values[name] = value;
    if (!value) return { name: '이름을 입력해 주세요.', email: '이메일을 입력해 주세요.', message: '메시지를 입력해 주세요.' }[name];
    if (name === 'email' && input.validity.typeMismatch) return '올바른 이메일 주소를 입력해 주세요.';
    if (input.maxLength > 0 && value.length > input.maxLength) return `${input.maxLength}자 이내로 입력해 주세요.`;
    return '';
  };

  const renderField = ({ name, input, errorElement }) => {
    const error = state.errors[name] || '';
    errorElement.textContent = error;
    input.setAttribute('aria-invalid', String(Boolean(error)));
  };
  const renderResult = () => {
    result.hidden = !state.submitted;
    const hasErrors = Object.values(state.errors).some(Boolean);
    result.classList.toggle('is-error', hasErrors);
    result.textContent = !state.submitted ? '' : hasErrors
      ? '입력 내용을 다시 확인해 주세요.'
      : '입력 확인이 완료되었습니다. 이 데모에서는 메시지를 실제 전송하지 않습니다.';
  };

  fields.forEach((field) => {
    field.input.addEventListener('input', () => {
      state.values[field.name] = field.input.value.trim();
      state.submitted = false;
      renderResult();
      if (state.validated.has(field.name)) {
        state.errors[field.name] = validateField(field);
        renderField(field);
      }
      characterCount.textContent = `${form.elements.message.value.length.toLocaleString('ko-KR')} / 3,000`;
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    fields.forEach((field) => {
      state.validated.add(field.name);
      state.errors[field.name] = validateField(field);
      renderField(field);
    });
    state.submitted = true;
    renderResult();
    const firstInvalid = fields.find(({ name }) => state.errors[name]);
    if (firstInvalid) firstInvalid.input.focus();
  });

  // 초기화가 끝난 뒤 브라우저 기본 안내를 필드별 오류 메시지로 대체합니다.
  form.noValidate = true;
  document.querySelector('#submit-button').disabled = false;
})();
