<p align="center">
  <img src="./gram-grid.svg" width="96" height="96" alt="">
</p>

<h1 align="center">Gram Grid</h1>

<p align="center"><strong>A TON wallet for Even G2 glasses and the R1 ring.</strong></p>

<p align="center">
  Pick a contact, swipe to set the amount, and review the transfer in your glasses.<br>
  Your phone holds the encrypted signing key and displays your QR code for incoming payments.
</p>

<p align="center">
  <a href="#try-it-without-glasses">Run the emulator</a> ·
  <a href="#inside-the-grid">Explore the grid</a> ·
  <a href="#ring-and-temple-controls">Learn the gestures</a>
</p>

<p align="center">
  <img src="./docs/lens-preview.png" width="840" alt="Two views through the glasses. On the left, Send is selected in the six-icon grid. On the right, the swap amount is set to 1.5 USDT.">
</p>

## Try it without glasses

From the repository root, use Node.js 22.13+ on the 22.x line (or Node.js 24) and npm.

```sh
npm ci
npm run lab
```

Open the phone and virtual glasses side by side in your browser. The command also starts the official Even Hub simulator, whose phone window pairs with the 3D glasses and ring view. Each environment keeps its own wallet. [Browser emulator](http://127.0.0.1:5186/app/?emulator=1) · [3D glasses and ring](http://127.0.0.1:5186/)

**First run**

1. Switch the phone to **Testnet** for practice. The default, **Mainnet**, uses real funds.
2. Choose **Create**, write down your 12 recovery words, set a device password, and confirm the three requested words. The six-icon grid appears in the glasses.
3. Open **Send**, tap to choose GRAM, and swipe **Up** twice. The lens shows **0.2 GRAM**. Long-press to return home. You can try this gesture sequence with an empty wallet.

## Inside the grid

| Action | What you can do |
| --- | --- |
| **Send** | Choose GRAM or USDT, set an amount, then select a contact, scan a payment QR with the phone camera, or enter an address. Review before signing. |
| **Receive** | The glasses show a shortened address and prompt you to show the QR code on your phone. You can also share the address from the phone. The same TON address accepts both assets on Mainnet. |
| **Swap** | Exchange GRAM and USDT through STON.fi. Review the estimated output, minimum received, and quote expiry before confirming. |
| **Balance** | Check both holdings and their combined USD estimate. Balances come from TON Center and prices from CoinGecko. |
| **History** | Swipe through finalized transfers. Each entry shows the amount, date, and sender or recipient. |
| **Contacts** | Save a name and address on the phone. Pick that contact from the grid, choose a currency and amount, and go straight to review. Each network has its own address book. |

**Network support.** Mainnet supports GRAM, USDT on TON, and swaps in both directions. Testnet supports native GRAM transfers. The same recovery phrase derives a different address on each network.

## Ring and temple controls

| Gesture | In the wallet |
| --- | --- |
| **Swipe up / down** | Move through the grid or a list. On a Send or Swap amount, **Up adds 0.1** and **Down subtracts 0.1** of the selected asset. |
| **Tap** | Open the selected item or accept the current step. On the review screen, tapping the selected checkmark confirms the operation in an unlocked session. |
| **Long press** | Return to the home grid. While the system menu is open, select **Home** there. |
| **Double click** | Return to the grid from a section. At the grid, the local lab stays open. On G2, this gesture requests the system exit prompt. |
| **Menu** | Choose **Back**, **Home**, or **Lock wallet**. Send and Swap provide a dedicated amount menu. |

The amount menu starts with **Max**, followed by **−0.1, −1, −10, +0.1, +1, +10**, **Reset to 0**, **Back**, and **Home**. For a GRAM transfer, Max leaves 0.02 GRAM for fees. For a swap, it also accounts for the GRAM required by the quoted route. USDT operations need GRAM for fees.

<details>
<summary><strong>Recovery, locking, and transaction tracking</strong></summary>

- **Create or import.** Recovery uses 12 English BIP-39 words. During creation, three incorrect checks trigger three new word positions, with unlimited attempts. In **Import**, paste the full phrase into any word field and select **Continue**. Once the words are verified, set a new device password and select **Import wallet**.
- **Local custody.** The phone derives an Ed25519 key at <code>m/44′/607′/0′</code> for TON Wallet V5R1. The vault in IndexedDB uses AES-256-GCM and a password-derived key (PBKDF2-SHA256, 600,000 iterations). Use localhost, HTTPS, or the installed Even App webview for wallet access.
- **Session lock.** Restarting the app or spending five minutes idle locks signing. **Lock wallet** does this immediately. The address, balance, and receive QR remain available.
- **Pending transfers.** Before broadcasting, Gram Grid saves the signed message hash locally. If the network response is lost, the app can resume checking TON Center for the transaction.

</details>

## Build and test

```sh
node --test chain.test.js local-wallet.test.js
npm run pack
```

The tests cover wallet recovery, first and subsequent payments in TON Sandbox, and retries when TON Center rate-limits a submission.

The build produces **`gram-grid.ehpk`** for Even Hub SDK 0.0.16. To run it on hardware, pair your G2 with Even App 2.2.10 or later and install the package through Even Hub. [Local installation guide](https://hub.evenrealities.com/docs/test/local-testing) · [Official simulator guide](https://hub.evenrealities.com/docs/test/simulator)
