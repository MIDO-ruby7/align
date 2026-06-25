# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-flow.spec.ts >> Game Flow >> register → create space → create room → start game → draw → discard
- Location: e2e/game-flow.spec.ts:18:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 5
Received: 6
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - link "Align" [ref=e4] [cursor=pointer]:
        - /url: /spaces
        - img [ref=e5]
        - text: Align
      - generic [ref=e10]:
        - generic [ref=e11]:
          - img [ref=e12]
          - text: E2E Tester
        - button "ログアウト" [ref=e16]:
          - img [ref=e17]
          - text: ログアウト
  - generic [ref=e21]:
    - generic [ref=e23]:
      - generic [ref=e24]:
        - text: 現在のターン
        - paragraph [ref=e25]: E2E Playerさん
      - generic [ref=e26]:
        - generic [ref=e27]:
          - paragraph [ref=e28]: 山札
          - paragraph [ref=e29]: 4枚
        - generic [ref=e30]:
          - paragraph [ref=e31]: Other
          - paragraph [ref=e32]: 1枚
    - generic [ref=e33]:
      - generic [ref=e34]:
        - heading "手札 (6 / 6)" [level=2] [ref=e35]
        - generic [ref=e36]: 捨てるカードを選んでください
      - generic [ref=e37]:
        - generic [ref=e38]:
          - paragraph [ref=e39]: 独創性
          - button "捨てる" [ref=e41]:
            - img [ref=e42]
            - text: 捨てる
        - generic [ref=e45]:
          - paragraph [ref=e46]: 論理性
          - button "捨てる" [ref=e48]:
            - img [ref=e49]
            - text: 捨てる
        - generic [ref=e52]:
          - paragraph [ref=e53]: 成長
          - button "捨てる" [ref=e55]:
            - img [ref=e56]
            - text: 捨てる
        - generic [ref=e59]:
          - paragraph [ref=e60]: 集中力
          - button "捨てる" [ref=e62]:
            - img [ref=e63]
            - text: 捨てる
        - generic [ref=e66]:
          - paragraph [ref=e67]: 決断力
          - button "捨てる" [ref=e69]:
            - img [ref=e70]
            - text: 捨てる
        - generic [ref=e73]:
          - paragraph [ref=e74]: 行動力
          - button "捨てる" [ref=e76]:
            - img [ref=e77]
            - text: 捨てる
    - generic [ref=e80]:
      - heading "プレイヤー一覧" [level=2] [ref=e81]
      - generic [ref=e83]:
        - generic [ref=e84]: "1"
        - generic [ref=e85]: E
        - generic [ref=e86]: E2E Player（あなた）
        - generic [ref=e87]: ターン中
```

# Test source

```ts
  62  | 
  63  |     const roomUrl = page.url();
  64  |     const roomId = roomUrl.split('/rooms/')[1];
  65  |     console.log(`3. ルーム作成完了: roomId=${roomId}`);
  66  |     await page.screenshot({ path: 'e2e/screenshots/03-room-lobby.png', fullPage: true });
  67  | 
  68  |     // ---- 4. ゲーム開始 ----
  69  |     const startBtn = page.getByText('ゲームを開始する');
  70  |     await startBtn.waitFor({ timeout: 5000 });
  71  | 
  72  |     await Promise.all([
  73  |       page.waitForURL(/\/rooms\/[0-9a-f-]{36}\/play$/, { timeout: 20000 }),
  74  |       startBtn.click(),
  75  |     ]);
  76  | 
  77  |     console.log(`4. ゲーム開始完了: ${page.url()}`);
  78  |     await page.screenshot({ path: 'e2e/screenshots/04-game-started.png', fullPage: true });
  79  | 
  80  |     // ---- 5. ゲーム画面確認 ----
  81  |     await expect(page.getByText('現在のターン')).toBeVisible({ timeout: 5000 });
  82  |     await expect(page.getByText('山札', { exact: true }).first()).toBeVisible();
  83  | 
  84  |     const handTitle = page.getByText(/手札 \(\d+ \/ 6\)/);
  85  |     await handTitle.waitFor({ timeout: 5000 });
  86  |     const initialHandText = await handTitle.textContent();
  87  |     console.log(`5. 初期手札: ${initialHandText}`);
  88  | 
  89  |     // 初期手札は5枚（ゲーム開始時の配布）
  90  |     expect(initialHandText).toMatch(/手札 \(5 \/ 6\)/);
  91  | 
  92  |     const currentTurnText = await page.locator('p.font-bold.text-lg.text-indigo-700').textContent().catch(() => '不明');
  93  |     console.log(`5. 現在のターン: ${currentTurnText}`);
  94  |     // 1人プレイなので自分のターン
  95  |     expect(currentTurnText).toContain('E2E Player');
  96  | 
  97  |     // ---- 6. ドロー操作 ----
  98  |     const drawDeckBtn = page.locator('button:has-text("山札から引く")');
  99  |     await drawDeckBtn.waitFor({ timeout: 5000 });
  100 |     const drawEnabled = await drawDeckBtn.isEnabled();
  101 |     console.log(`6. 山札から引くボタン enabled: ${drawEnabled}`);
  102 |     expect(drawEnabled).toBe(true);
  103 | 
  104 |     await drawDeckBtn.click();
  105 |     // WebSocket 経由の状態更新を待つ
  106 |     await page.waitForTimeout(2000);
  107 | 
  108 |     await page.screenshot({ path: 'e2e/screenshots/05-after-draw.png', fullPage: true });
  109 | 
  110 |     const handAfterDraw = await page.getByText(/手札 \(\d+ \/ 6\)/).textContent().catch(() => null);
  111 |     console.log(`6. ドロー後手札: ${handAfterDraw}`);
  112 | 
  113 |     const match = handAfterDraw?.match(/手札 \((\d+) \/ 6\)/);
  114 |     const handCount = match ? parseInt(match[1], 10) : -1;
  115 |     console.log(`6. 手札枚数: ${handCount}`);
  116 |     // ドロー後は6枚になるはず
  117 |     expect(handCount).toBe(6);
  118 | 
  119 |     // ---- 7. 捨て操作 ----
  120 |     console.log('7. 捨てモード確認');
  121 | 
  122 |     const discardBanner = page.getByText('捨てるカードを選んでください');
  123 |     const bannerVisible = await discardBanner.isVisible().catch(() => false);
  124 |     console.log(`7. 捨てモードバナー: ${bannerVisible}`);
  125 |     expect(bannerVisible).toBe(true);
  126 | 
  127 |     // 捨てるボタン（GameCard コンポーネント内の button）
  128 |     const discardBtns = page.locator('button:has-text("捨てる")');
  129 |     const discardCount = await discardBtns.count();
  130 |     console.log(`7. 捨てるボタン数: ${discardCount}`);
  131 |     // 6枚のカードそれぞれに捨てるボタンがある
  132 |     expect(discardCount).toBe(6);
  133 | 
  134 |     // 最初のカードを捨てる
  135 |     await discardBtns.first().click();
  136 |     await page.waitForTimeout(2000);
  137 | 
  138 |     await page.screenshot({ path: 'e2e/screenshots/06-after-discard.png', fullPage: true });
  139 | 
  140 |     // エラーがないことを確認
  141 |     const hasOops = await page.getByText('Oops').isVisible().catch(() => false);
  142 |     console.log(`7. Oopsエラー: ${hasOops}`);
  143 |     expect(hasOops).toBe(false);
  144 | 
  145 |     // Other枚数が増えているか確認（サーバーはカードをOtherに移動した）
  146 |     const otherCountEl = page.locator('text=Other').locator('..').locator('p.text-xl');
  147 |     const otherCountText = await otherCountEl.textContent().catch(() => null);
  148 |     console.log(`7. Other枚数: ${otherCountText}`);
  149 | 
  150 |     const handAfterDiscard = await page.getByText(/手札 \(\d+ \/ 6\)/).textContent().catch(() => null);
  151 |     console.log(`7. 捨て後手札表示: ${handAfterDiscard}`);
  152 | 
  153 |     const matchAfter = handAfterDiscard?.match(/手札 \((\d+) \/ 6\)/);
  154 |     const countAfter = matchAfter ? parseInt(matchAfter[1], 10) : -1;
  155 | 
  156 |     // バグ確認: 捨てた後も手札が6枚のままなら「カード捨てても動作しない」バグ
  157 |     if (countAfter === 6) {
  158 |       console.log('バグ確認: 捨てた後も手札が6枚のまま（UIが更新されていない）');
  159 |       console.log('原因: applyRoomEvent の game.turn_advanced が myHand を更新していない');
  160 |       console.log('      discardAPI が discardedCardId をWebSocketで通知していない');
  161 |       // バグとして記録するが、テスト失敗とする
> 162 |       expect(countAfter).toBe(5); // 期待値5枚（現在6枚でバグ）
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  163 |     } else if (countAfter === 5) {
  164 |       console.log(`7. 捨て成功: 6枚 → 5枚（正常）`);
  165 |     } else {
  166 |       console.log(`7. 捨て後手札: ${countAfter}枚（予期しない値）`);
  167 |     }
  168 | 
  169 |     await page.screenshot({ path: 'e2e/screenshots/07-final-state.png', fullPage: true });
  170 |     console.log('テスト完了');
  171 |   });
  172 | });
  173 | 
```