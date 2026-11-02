# Неделя 11: CPI и composable applications

**Задание:** создать приложение, которое взаимодействует с несколькими существующими Solana Programs.

## Что такое CPI

CPI (cross-program invocation) это вызов одной программы из другой внутри одной транзакции.
Так программы Solana собираются как конструктор: наша программа не пишет свой перевод SOL
или свой токен, а вызывает готовые System Program и Token Program.

Если вызываемой программе нужна подпись PDA, наша программа подписывает за него
через `invoke_signed` (в Anchor это `CpiContext::new_with_signer` и seeds PDA). Так jar PDA
становится mint authority токена и выпускает токены без приватного ключа.

## Что добавлено

Новые инструкции в `programs/tip_jar/src/lib.rs`:

| Инструкция | Что делает | Какие программы вызывает |
|---|---|---|
| `create_reward_mint` | Владелец создаёт reward-токен своей копилки (PDA `["reward", jar]`, 0 знаков, authority = jar) | System Program (создание аккаунта), Token Program (инициализация mint) |
| `tip_with_receipt(amount)` | Чаевые + чек-токен за них | **System Program** (перевод SOL), **Token Program** (`mint_to`, подписывает jar PDA), **Memo Program** (запись заметки в лог) |

Одна транзакция «Tip + receipt token» затрагивает 4 программы: Associated Token Account
(создаёт token account получателя токена), System, Token и Memo (последние три вызваны
из `tip_jar`).

Безопасность:
- Адрес Memo Program закреплён (`address = MEMO_PROGRAM_ID`), подставить чужую программу нельзя.
- `reward_mint` берётся только по PDA-сидам jar, а token account проверяется на mint и владельца.
- Выпускать токены может только программа: authority это PDA, у которого нет приватного ключа.

Клиент: `web/src/lib/tipjar.ts` (инструкции), кнопки в `web/src/App.tsx`
(**Create reward token** и **Tip + receipt token**). Тесты: `tests/cpi.ts`.

## Как проверить

```bash
anchor build
anchor deploy                 # обнови программу в Devnet
npm install
anchor test --provider.cluster devnet
cd web && npm install && npm run dev
```
В приложении: владелец jar нажимает Create reward token, затем другой кошелёк вводит его
адрес и нажимает Tip + receipt token. В Explorer открой транзакцию и найди блок
**Inner Instructions**: там будут вложенные вызовы System, Token и Memo. Memo-запись видна
в Program Logs.

## Что сдавать

- Ссылка на этот коммит.
- Ссылка на транзакцию «tip with receipt» в Solana Explorer (cluster=devnet) со скриншотом
  вложенных вызовов (Inner Instructions).
- Код CPI: функция `tip_with_receipt` в `programs/tip_jar/src/lib.rs`.

## Честная заметка о проверке

Программа и клиент не компилировались в среде, где писались (не было доступа к npm и
cargo). Вероятнее всего ошибки, если они будут, появятся на `anchor build` (версии
anchor-lang и anchor-spl должны совпадать: 0.31.1). Пришли текст ошибки, и я исправлю.
