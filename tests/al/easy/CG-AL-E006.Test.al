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

        // [THEN] Extension fields are accessible
        CustomerCard."VIP Customer".AssertEquals(false);

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
        CustomerCard.Close();

        // [THEN] The changes are saved
        Customer.Get(Customer."No.");
        Assert.IsTrue(Customer."VIP Customer", 'VIP Customer should be updated');
        Assert.AreEqual('Test notes from page', Customer."Customer Notes", 'Customer Notes should be updated');

        // Cleanup
        Customer.Delete();
    end;
}
