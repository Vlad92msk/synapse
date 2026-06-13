// Расширяет expect матчерами @testing-library/jest-dom (используются в react-тестах).
// Импорт безопасен и в node-среде — только регистрирует матчеры через expect.extend.
import '@testing-library/jest-dom/vitest'
