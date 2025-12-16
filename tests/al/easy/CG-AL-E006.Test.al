codeunit 80006 "CG-AL-E006 Test"
{
    // Tests for CG-AL-E006: Page Extension - Customer Card Extension
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";

    [Test]
    procedure TestPreferredContactMethodField()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Preferred Contact Method field exists on Customer
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We access the Preferred Contact Method field
        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::Email;
        Customer.Modify();

        // [THEN] The value is stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::Email, Customer."Preferred Contact Method",
            'Preferred Contact Method should be stored');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPreferredContactMethodAllOptions()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] All Preferred Contact Method option values are valid
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN/THEN] We can set each option value
        // Email=0, Phone=1, Mail=2, SMS=3
        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::Email;
        Customer.Modify();
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::Email, Customer."Preferred Contact Method", 'Should be Email');

        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::Phone;
        Customer.Modify();
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::Phone, Customer."Preferred Contact Method", 'Should be Phone');

        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::Mail;
        Customer.Modify();
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::Mail, Customer."Preferred Contact Method", 'Should be Mail');

        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::SMS;
        Customer.Modify();
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::SMS, Customer."Preferred Contact Method", 'Should be SMS');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCustomerNotesField()
    var
        Customer: Record Customer;
        Notes: Text[500];
    begin
        // [SCENARIO] Customer Notes field exists on Customer
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);
        Notes := 'Important customer - handle with priority';

        // [WHEN] We access the Customer Notes field
        Customer."Customer Notes" := Notes;
        Customer.Modify();

        // [THEN] The value is stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(Notes, Customer."Customer Notes", 'Customer Notes should be stored');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestVIPCustomerField()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] VIP Customer field exists on Customer
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set VIP Customer to true
        Customer."VIP Customer" := true;
        Customer.Modify();

        // [THEN] The value is stored correctly
        Customer.Get(Customer."No.");
        Assert.IsTrue(Customer."VIP Customer", 'VIP Customer should be true');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPageExtensionFieldsVisible()
    var
        Customer: Record Customer;
        CustomerCard: TestPage "Customer Card";
    begin
        // [SCENARIO] Extension fields are visible on Customer Card page
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We open the Customer Card page
        CustomerCard.OpenView();
        CustomerCard.GoToRecord(Customer);

        // [THEN] Extension fields are accessible (default values)
        CustomerCard."VIP Customer".AssertEquals(false);
        CustomerCard."Customer Notes".AssertEquals('');
        CustomerCard."Preferred Contact Method".AssertEquals('Email'); // Default is first option

        CustomerCard.Close();

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPageExtensionFieldsEditable()
    var
        Customer: Record Customer;
        CustomerCard: TestPage "Customer Card";
    begin
        // [SCENARIO] Extension fields can be edited on Customer Card page
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We edit extension fields via the page
        CustomerCard.OpenEdit();
        CustomerCard.GoToRecord(Customer);
        CustomerCard."VIP Customer".SetValue(true);
        CustomerCard."Customer Notes".SetValue('Test notes from page');
        CustomerCard."Preferred Contact Method".SetValue('Phone');
        CustomerCard.Close();

        // [THEN] The changes are saved
        Customer.Get(Customer."No.");
        Assert.IsTrue(Customer."VIP Customer", 'VIP Customer should be updated');
        Assert.AreEqual('Test notes from page', Customer."Customer Notes", 'Customer Notes should be updated');
        Assert.AreEqual(Customer."Preferred Contact Method"::Phone, Customer."Preferred Contact Method",
            'Preferred Contact Method should be Phone');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestAllExtensionFieldsTogether()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] All extension fields can be used together
        // [GIVEN] A Customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set all extension fields
        Customer."Preferred Contact Method" := Customer."Preferred Contact Method"::SMS;
        Customer."Customer Notes" := 'VIP customer - priority handling required';
        Customer."VIP Customer" := true;
        Customer.Modify();

        // [THEN] All values are stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(Customer."Preferred Contact Method"::SMS, Customer."Preferred Contact Method",
            'Preferred Contact Method should be SMS');
        Assert.AreEqual('VIP customer - priority handling required', Customer."Customer Notes",
            'Customer Notes should be stored');
        Assert.IsTrue(Customer."VIP Customer", 'VIP Customer should be true');

        // Cleanup
        Customer.Delete();
    end;
}
