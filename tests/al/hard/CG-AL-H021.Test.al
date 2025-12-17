codeunit 80021 "CG-AL-H021 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestEmailChannel_GetChannelName()
    var
        EmailChannel: Codeunit "CG Email Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := EmailChannel;

        Assert.AreEqual('Email', Channel.GetChannelName(), 'Email channel name should be Email');
    end;

    [Test]
    procedure TestEmailChannel_Send()
    var
        EmailChannel: Codeunit "CG Email Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := EmailChannel;

        Assert.IsTrue(Channel.Send('Test message'), 'Email Send should return true');
    end;

    [Test]
    procedure TestSMSChannel_GetChannelName()
    var
        SMSChannel: Codeunit "CG SMS Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := SMSChannel;

        Assert.AreEqual('SMS', Channel.GetChannelName(), 'SMS channel name should be SMS');
    end;

    [Test]
    procedure TestSMSChannel_Send()
    var
        SMSChannel: Codeunit "CG SMS Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := SMSChannel;

        Assert.IsTrue(Channel.Send('Test SMS'), 'SMS Send should return true');
    end;

    [Test]
    procedure TestSlackChannel_GetChannelName()
    var
        SlackChannel: Codeunit "CG Slack Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := SlackChannel;

        Assert.AreEqual('Slack', Channel.GetChannelName(), 'Slack channel name should be Slack');
    end;

    [Test]
    procedure TestSlackChannel_Send()
    var
        SlackChannel: Codeunit "CG Slack Channel";
        Channel: Interface "INotificationChannel";
    begin
        Channel := SlackChannel;

        Assert.IsTrue(Channel.Send('Test Slack message'), 'Slack Send should return true');
    end;

    [Test]
    procedure TestRegisterChannel_SingleChannel()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        Names: List of [Text];
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);

        Names := NotificationMgr.GetRegisteredChannelNames();

        Assert.AreEqual(1, Names.Count, 'Should have 1 registered channel');
        Assert.AreEqual('Email', Names.Get(1), 'Should be Email channel');
    end;

    [Test]
    procedure TestRegisterChannel_MultipleChannels()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        SlackChannel: Codeunit "CG Slack Channel";
        Names: List of [Text];
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);
        NotificationMgr.RegisterChannel(SMSChannel);
        NotificationMgr.RegisterChannel(SlackChannel);

        Names := NotificationMgr.GetRegisteredChannelNames();

        Assert.AreEqual(3, Names.Count, 'Should have 3 registered channels');
    end;

    [Test]
    procedure TestBroadcastMessage_AllChannels()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        SuccessCount: Integer;
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);
        NotificationMgr.RegisterChannel(SMSChannel);

        SuccessCount := NotificationMgr.BroadcastMessage('Hello everyone');

        Assert.AreEqual(2, SuccessCount, 'Should have 2 successful sends');
    end;

    [Test]
    procedure TestBroadcastMessage_NoChannels()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        SuccessCount: Integer;
    begin
        NotificationMgr.ClearChannels();

        SuccessCount := NotificationMgr.BroadcastMessage('Hello');

        Assert.AreEqual(0, SuccessCount, 'Should have 0 sends with no channels');
    end;

    [Test]
    procedure TestRegisterNamedChannel_Single()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        Result: Boolean;
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterNamedChannel('primary-email', EmailChannel);

        Result := NotificationMgr.SendToChannel('primary-email', 'Test');

        Assert.IsTrue(Result, 'Should send successfully to named channel');
    end;

    [Test]
    procedure TestRegisterNamedChannel_Multiple()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        SlackChannel: Codeunit "CG Slack Channel";
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterNamedChannel('email', EmailChannel);
        NotificationMgr.RegisterNamedChannel('sms', SMSChannel);
        NotificationMgr.RegisterNamedChannel('slack', SlackChannel);

        Assert.IsTrue(NotificationMgr.SendToChannel('email', 'Email test'), 'Should send to email');
        Assert.IsTrue(NotificationMgr.SendToChannel('sms', 'SMS test'), 'Should send to sms');
        Assert.IsTrue(NotificationMgr.SendToChannel('slack', 'Slack test'), 'Should send to slack');
    end;

    [Test]
    procedure TestSendToChannel_NotFound()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        Result: Boolean;
    begin
        NotificationMgr.ClearChannels();

        Result := NotificationMgr.SendToChannel('nonexistent', 'Test');

        Assert.IsFalse(Result, 'Should return false for non-existent channel');
    end;

    [Test]
    procedure TestGetChannelByName_Found()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        RetrievedChannel: Interface "INotificationChannel";
        Found: Boolean;
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterNamedChannel('my-email', EmailChannel);

        Found := NotificationMgr.GetChannelByName('my-email', RetrievedChannel);

        Assert.IsTrue(Found, 'Should find the channel');
        Assert.AreEqual('Email', RetrievedChannel.GetChannelName(), 'Should get Email channel');
    end;

    [Test]
    procedure TestGetChannelByName_NotFound()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        RetrievedChannel: Interface "INotificationChannel";
        Found: Boolean;
    begin
        NotificationMgr.ClearChannels();

        Found := NotificationMgr.GetChannelByName('unknown', RetrievedChannel);

        Assert.IsFalse(Found, 'Should not find non-existent channel');
    end;

    [Test]
    procedure TestClearChannels_ClearsList()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        Names: List of [Text];
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);
        NotificationMgr.RegisterChannel(SMSChannel);

        NotificationMgr.ClearChannels();
        Names := NotificationMgr.GetRegisteredChannelNames();

        Assert.AreEqual(0, Names.Count, 'Should have no channels after clear');
    end;

    [Test]
    procedure TestClearChannels_ClearsDictionary()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        Result: Boolean;
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterNamedChannel('email', EmailChannel);

        NotificationMgr.ClearChannels();
        Result := NotificationMgr.SendToChannel('email', 'Test');

        Assert.IsFalse(Result, 'Dictionary should be cleared');
    end;

    [Test]
    procedure TestGetRegisteredChannelNames_PreservesOrder()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        SlackChannel: Codeunit "CG Slack Channel";
        Names: List of [Text];
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);
        NotificationMgr.RegisterChannel(SMSChannel);
        NotificationMgr.RegisterChannel(SlackChannel);

        Names := NotificationMgr.GetRegisteredChannelNames();

        Assert.AreEqual('Email', Names.Get(1), 'First should be Email');
        Assert.AreEqual('SMS', Names.Get(2), 'Second should be SMS');
        Assert.AreEqual('Slack', Names.Get(3), 'Third should be Slack');
    end;

    [Test]
    procedure TestBroadcastMessage_ThreeChannels()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        SlackChannel: Codeunit "CG Slack Channel";
        SuccessCount: Integer;
    begin
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterChannel(EmailChannel);
        NotificationMgr.RegisterChannel(SMSChannel);
        NotificationMgr.RegisterChannel(SlackChannel);

        SuccessCount := NotificationMgr.BroadcastMessage('Important notification');

        Assert.AreEqual(3, SuccessCount, 'All three channels should succeed');
    end;

    [Test]
    procedure TestInterfacePolymorphism()
    var
        NotificationMgr: Codeunit "CG Notification Manager";
        EmailChannel: Codeunit "CG Email Channel";
        SMSChannel: Codeunit "CG SMS Channel";
        Channel: Interface "INotificationChannel";
        Found: Boolean;
    begin
        // Test that different implementations work through the same interface
        NotificationMgr.ClearChannels();
        NotificationMgr.RegisterNamedChannel('channel1', EmailChannel);
        NotificationMgr.RegisterNamedChannel('channel2', SMSChannel);

        Found := NotificationMgr.GetChannelByName('channel1', Channel);
        Assert.IsTrue(Found, 'Should find channel1');
        Assert.AreEqual('Email', Channel.GetChannelName(), 'channel1 should be Email');

        Found := NotificationMgr.GetChannelByName('channel2', Channel);
        Assert.IsTrue(Found, 'Should find channel2');
        Assert.AreEqual('SMS', Channel.GetChannelName(), 'channel2 should be SMS');
    end;
}
