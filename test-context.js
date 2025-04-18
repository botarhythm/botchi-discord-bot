const contextManager = require('./context-manager.js');

async function testContextManager() {
    try {
        // テストユーザーID
        const userId = 'test-user';

        // 会話履歴をクリア
        await contextManager.clearConversation(userId);
        console.log('会話履歴をクリアしました');

        // テスト用の会話を追加
        await contextManager.addMessage(userId, 'user', 'こんにちは、ボッチーさん');
        await contextManager.addMessage(userId, 'assistant', 'はい、こんにちは！お手伝いできることはありますか？');
        await contextManager.addMessage(userId, 'user', '今日の天気について教えてください');
        await contextManager.addMessage(userId, 'assistant', '申し訳ありませんが、私はリアルタイムの天気情報にはアクセスできません。天気予報を確認するには、気象庁のウェブサイトなどをご利用ください。');
        
        // 会話履歴を取得して表示
        const history = await contextManager.getConversationHistory(userId, true, true);
        console.log('\n=== 会話履歴（詳細） ===');
        console.log(JSON.stringify(history, null, 2));

    } catch (error) {
        console.error('エラーが発生しました:', error);
    }
}

// テストを実行
testContextManager(); 