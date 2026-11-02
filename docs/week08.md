# Неделя 8: PK1, BUILD SPRINT: первый Web3 MVP

**Задание:** создать работающий прототип в формате мини-хакатона.

## Проект: Tip Jar on Solana

Каждый кошелёк может открыть «копилку» (jar, это PDA). Любой человек может
отправить в неё чаевые в SOL, а забрать их может только владелец.

Сценарий пользователя:

1. Подключить кошелёк (Phantom, Devnet).
2. Нажать **Create jar** и задать имя копилки.
3. Другой пользователь вводит адрес владельца и отправляет **Send tip**.
4. Владелец видит сумму и число чаевых и нажимает **Withdraw SOL**.

## Что сделано

| Часть | Файл |
|---|---|
| On-chain программа (Anchor) | `programs/tip_jar/src/lib.rs` |
| Инструкции | `create_jar`, `tip`, `withdraw` |
| Аккаунт | `Jar` (owner, name, total_tips, tip_count, bump), PDA `["jar", owner]` |
| Тесты Anchor | `tests/tip_jar.ts` |
| Web-клиент (React + Vite) | `web/` |

Защита в программе:
- Withdraw только для владельца (`has_one = owner` и сиды PDA).
- Нельзя вывести rent-резерв аккаунта.
- Проверка нулевой суммы и переполнения (`checked_add`).

## Как запустить

```bash
# 1. Программа
solana config set --url devnet
solana airdrop 2
anchor build
anchor keys sync          # подставит твой program id в lib.rs и Anchor.toml
anchor build
anchor deploy             # запиши Program ID

# 2. Тесты (по желанию)
npm install
anchor test --provider.cluster devnet

# 3. Web-клиент
cd web
echo "VITE_PROGRAM_ID=<твой Program ID>" > .env
npm install
npm run dev               # откроется http://localhost:5173
```

## Что сдавать

- Ссылка на этот коммит в GitHub.
- Program ID и ссылка на него в Solana Explorer (cluster=devnet).
- 1-2 скриншота: созданный jar и транзакция tip в Explorer.

## Честная заметка о проверке

Код написан и закоммичен без запуска `anchor build` и `npm run build`: в среде, где он
создавался, не было доступа к реестрам пакетов. Перед сдачей запусти шаги выше у себя,
и если компилятор покажет ошибку, пришли её текст.
